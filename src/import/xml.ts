/*
 * Just enough XML to read Word files with (DESIGN.md §13), without a DOM, so it runs the same in tests: elements,
 * attributes, text, CDATA and character references. A doctype is skipped and its entities never expanded. Names
 * come out with the usual prefix for the namespaces Word uses, whatever prefix the file chose ("w:p"), "{uri}name"
 * for other namespaces and the bare name for none.
 */

export interface XmlElement {
  name: string
  attrs: Map<string, string>
  children: XmlNode[]
}

export type XmlNode = XmlElement | string

export class XmlError extends Error {
  override name = "XmlError"
}

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"

/** Word's namespaces, transitional and strict, by the prefix Word itself gives them. */
const PREFIXES: Record<string, string> = {
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
  "http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
  "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
  "http://purl.oclc.org/ooxml/officeDocument/relationships": "r",
  "http://schemas.openxmlformats.org/package/2006/relationships": "rel",
  "http://schemas.openxmlformats.org/package/2006/metadata/core-properties": "cp",
  "http://purl.org/dc/elements/1.1/": "dc",
  "http://purl.org/dc/terms/": "dcterms",
  [XML_NAMESPACE]: "xml",
}

const MAX_DEPTH = 1000

const START_TAG = /<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y
const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const REFERENCE = /&(?:#(\d+)|#x([\da-f]+)|(lt|gt|amp|quot|apos));/gi
const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }

function decode(text: string): string {
  if (!text.includes("&")) return text
  return text.replace(REFERENCE, (match, decimal?: string, hex?: string, name?: string) => {
    if (name) return NAMED[name.toLowerCase()]
    const code = decimal ? Number.parseInt(decimal, 10) : Number.parseInt(hex!, 16)
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : match
  })
}

/** The name with its namespace's usual prefix. Unprefixed attributes are in no namespace. */
function qualify(name: string, namespaces: ReadonlyMap<string, string>, element: boolean): string {
  const colon = name.indexOf(":")
  const prefix = colon === -1 ? "" : name.slice(0, colon)
  const local = name.slice(colon + 1)
  if (!prefix && !element) return local
  const uri = namespaces.get(prefix)
  // A prefix the file never declared: kept as written, which for Word's own is what's wanted anyway.
  if (uri === undefined) return name
  if (!uri) return local
  const known = PREFIXES[uri]
  return known ? `${known}:${local}` : `{${uri}}${local}`
}

function skipPast(source: string, token: string, from: number): number {
  const end = source.indexOf(token, from)
  if (end === -1) throw new XmlError(`No closing ${token}`)
  return end + token.length
}

/** Past a `<!DOCTYPE …>`, internal subset and all. */
function skipDeclaration(source: string, start: number): number {
  let depth = 0
  for (let i = start + 2; i < source.length; i++) {
    const char = source[i]
    if (char === '"' || char === "'") {
      i = source.indexOf(char, i + 1)
      if (i === -1) break
    } else if (char === "[") depth++
    else if (char === "]") depth--
    else if (char === ">" && depth <= 0) return i + 1
  }
  throw new XmlError("Unclosed declaration")
}

interface Open {
  element: XmlElement
  tag: string
  namespaces: ReadonlyMap<string, string>
}

/** The document, as an element named "#document" holding the root. Throws an XmlError if it can't be read. */
export function parseXml(source: string): XmlElement {
  const document: XmlElement = { name: "#document", attrs: new Map(), children: [] }
  const stack: Open[] = [{ element: document, tag: "", namespaces: new Map([["xml", XML_NAMESPACE]]) }]
  const addText = (text: string) => {
    if (text) stack.at(-1)!.element.children.push(text)
  }
  let i = 0
  while (i < source.length) {
    const open = source.indexOf("<", i)
    if (open === -1) {
      addText(decode(source.slice(i)))
      break
    }
    if (open > i) addText(decode(source.slice(i, open)))
    if (source.startsWith("<!--", open)) {
      i = skipPast(source, "-->", open + 4)
    } else if (source.startsWith("<![CDATA[", open)) {
      i = skipPast(source, "]]>", open + 9)
      addText(source.slice(open + 9, i - 3))
    } else if (source.startsWith("<?", open)) {
      i = skipPast(source, "?>", open + 2)
    } else if (source.startsWith("<!", open)) {
      i = skipDeclaration(source, open)
    } else if (source[open + 1] === "/") {
      i = skipPast(source, ">", open)
      const tag = source.slice(open + 2, i - 1).trim()
      // Closes the matching element, and any left open inside it.
      let depth = stack.length - 1
      while (depth > 0 && stack[depth].tag !== tag) depth--
      if (depth > 0) stack.length = depth
    } else {
      START_TAG.lastIndex = open
      const match = START_TAG.exec(source)
      if (!match) throw new XmlError(`Unreadable tag at ${open}`)
      const [whole, tag, attributeText, selfClosing] = match
      const parent = stack.at(-1)!
      let namespaces = parent.namespaces
      const attributes: [string, string][] = []
      for (const [, name, double, single] of attributeText.matchAll(ATTRIBUTE)) {
        const value = decode(double ?? single ?? "")
        if (name === "xmlns" || name.startsWith("xmlns:")) {
          if (namespaces === parent.namespaces) namespaces = new Map(namespaces)
          ;(namespaces as Map<string, string>).set(name === "xmlns" ? "" : name.slice(6), value)
        } else attributes.push([name, value])
      }
      const element: XmlElement = {
        name: qualify(tag, namespaces, true),
        attrs: new Map(attributes.map(([name, value]) => [qualify(name, namespaces, false), value])),
        children: [],
      }
      parent.element.children.push(element)
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new XmlError("Nested too deeply")
        stack.push({ element, tag, namespaces })
      }
      i = open + whole.length
    }
  }
  return document
}

export const isElement = (node: XmlNode): node is XmlElement => typeof node !== "string"

export const childElements = (element: XmlElement) => element.children.filter(isElement)

/** The first child element of the name. */
export const childNamed = (element: XmlElement | undefined, name: string): XmlElement | undefined =>
  element?.children.find((node): node is XmlElement => isElement(node) && node.name === name)

/** Every element of the name, at any depth, in document order. */
export function descendantsNamed(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = []
  const visit = (node: XmlElement) => {
    for (const child of node.children) {
      if (!isElement(child)) continue
      if (child.name === name) found.push(child)
      else visit(child)
    }
  }
  visit(element)
  return found
}

export const textContent = (element: XmlElement): string =>
  element.children.map((node) => (isElement(node) ? textContent(node) : node)).join("")
