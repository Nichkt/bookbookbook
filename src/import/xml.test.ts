import { describe, expect, it } from "vitest"
import { childElements, descendantsNamed, parseXml, textContent, XmlError, type XmlElement } from "./xml"

const root = (source: string) => childElements(parseXml(source))[0]

describe("parseXml", () => {
  it("reads elements, attributes and text, with references decoded", () => {
    const doc = root(`<?xml version="1.0"?><a x="1" y='two &amp; &#51;'>Fish &lt;&amp;&gt; chips &#x1F41F;<b/>&quot;!&apos;</a>`)
    expect(doc.name).toBe("a")
    expect(Object.fromEntries(doc.attrs)).toEqual({ x: "1", y: "two & 3" })
    expect(doc.children).toEqual(["Fish <&> chips 🐟", { name: "b", attrs: new Map(), children: [] }, `"!'`])
  })

  it("keeps CDATA as it is, and skips comments, instructions and a doctype without expanding its entities", () => {
    const doc = root(
      `<!DOCTYPE a [<!ENTITY boom "BOOM"><!ELEMENT a ANY>]><!-- note --><a><?pi data?><![CDATA[<raw> &amp;]]>&boom;</a>`,
    )
    expect(textContent(doc)).toBe("<raw> &amp;&boom;")
  })

  it("names Word's namespaces by Word's prefixes, whatever prefix the file chose", () => {
    const doc = root(
      `<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:o="urn:other">` +
        `<x:body><x:p x:rsid="1" plain="2" xml:space="preserve"/><o:thing/></x:body></x:document>`,
    )
    expect(doc.name).toBe("w:document")
    const [p, thing] = childElements(childElements(doc)[0])
    expect(p.name).toBe("w:p")
    expect([...p.attrs.keys()]).toEqual(["w:rsid", "plain", "xml:space"])
    expect(thing.name).toBe("{urn:other}thing")
  })

  it("reads Word's strict namespace as its usual one, and a default namespace for elements only", () => {
    const doc = root(`<document xmlns="http://purl.oclc.org/ooxml/wordprocessingml/main" val="1"><body/></document>`)
    expect(doc.name).toBe("w:document")
    expect([...doc.attrs.keys()]).toEqual(["val"])
    expect(childElements(doc)[0].name).toBe("w:body")
  })

  it("keeps a prefix nobody declared as written", () => {
    expect(root(`<w:p><w:t>Hi</w:t></w:p>`).name).toBe("w:p")
  })

  it("closes elements left open when their parent closes", () => {
    const doc = root(`<a><b><c>one</a><d/>`)
    expect(textContent(doc)).toBe("one")
    expect(descendantsNamed(parseXml(`<a><b><c>one</a><d/>`), "d")).toHaveLength(1)
  })

  it("finds descendants by name, not looking inside those it finds", () => {
    const doc = root(`<a><p id="1"><p id="2"/></p><q><p id="3"/></q></a>`)
    expect(descendantsNamed(doc, "p").map((element: XmlElement) => element.attrs.get("id"))).toEqual(["1", "3"])
  })

  it("throws on what it can't read", () => {
    expect(() => parseXml(`<a><!-- never closed</a>`)).toThrow(XmlError)
    expect(() => parseXml(`<a b=unquoted></a>`)).toThrow(XmlError)
    expect(() => parseXml(`<!DOCTYPE a [`)).toThrow(XmlError)
    expect(() => parseXml("<a>".repeat(1001))).toThrow(XmlError)
    expect(() => parseXml("<a>".repeat(999))).not.toThrow()
  })
})
