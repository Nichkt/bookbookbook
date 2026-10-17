import { MARKS, type Inline, type MarkName } from "@/export/blocks"
import { unzipLimited } from "@/lib/unzip"
import { ImportError, NOT_A_DOCX } from "./errors"
import { headingPiece, paragraphPiece, type Piece, type ReadManuscript } from "./pieces"
import { childElements, childNamed, descendantsNamed, isElement, parseXml, textContent, type XmlElement } from "./xml"

/*
 * Word documents for import (DESIGN.md §13), read straight from the .docx: the paragraphs of the main document,
 * which of them are headings and at what level (from their styles), centring, and bold, italic, underline and
 * strikethrough, however they were applied. Tracked changes read as accepted; deleted text, hidden text, field
 * codes, tables of contents, drawings, footnotes and comments are left behind. A table's paragraphs come in order.
 */

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
const MAX_STYLES_BYTES = 16 * 1024 * 1024
const MAX_SMALL_BYTES = 1024 * 1024
const MAX_TOTAL_BYTES = 128 * 1024 * 1024
const MAX_ENTRIES = 20_000

/** Unpacks the parts wanted, by lower-cased name, as Word's part names don't care about case. */
function unzip(data: Uint8Array, limit: (name: string) => number): Map<string, Uint8Array> {
  try {
    const files = unzipLimited(data, { limit: (name) => limit(name.toLowerCase()), maxTotal: MAX_TOTAL_BYTES, maxEntries: MAX_ENTRIES })
    return new Map([...files].map(([name, bytes]) => [name.toLowerCase(), bytes]))
  } catch {
    throw new ImportError(NOT_A_DOCX)
  }
}

function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes)
  return new TextDecoder().decode(bytes)
}

function readXml(bytes: Uint8Array | undefined): XmlElement | null {
  if (!bytes) return null
  try {
    return parseXml(decodeXml(bytes))
  } catch {
    return null
  }
}

// Package parts

interface Relationship {
  type: string
  target: string
}

function relationships(bytes: Uint8Array | undefined): Relationship[] {
  const root = readXml(bytes)
  if (!root) return []
  return descendantsNamed(root, "rel:Relationship")
    .filter((element) => element.attrs.get("TargetMode") !== "External")
    .map((element) => ({ type: element.attrs.get("Type") ?? "", target: element.attrs.get("Target") ?? "" }))
}

const folderOf = (part: string) => part.slice(0, part.lastIndexOf("/") + 1)

const relsOf = (part: string) => `${folderOf(part)}_rels/${part.slice(part.lastIndexOf("/") + 1)}.rels`

/** The part a relationship of the type points to, from the folder of the part that has it. */
function related(relations: Relationship[], type: string, folder: string): string | null {
  const target = relations.find((relation) => relation.type.endsWith(type))?.target
  if (!target) return null
  const segments: string[] = []
  for (const segment of (target.startsWith("/") ? target.slice(1) : folder + target).split("/")) {
    if (segment === "..") segments.pop()
    else if (segment && segment !== ".") segments.push(segment)
  }
  return segments.join("/").toLowerCase() || null
}

// Styles

interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  hidden?: boolean
}

interface Style {
  name: string
  basedOn: string | null
  outline: string | null
  /** The paragraph alignment it sets, if it sets one. */
  align: string | null
  run: RunProps
}

/** A toggle's value: on unless its w:val says otherwise. */
const isOn = (value: string | undefined) => value === undefined || !/^(0|false|off)$/i.test(value.trim())

function runProps(properties: XmlElement | undefined): RunProps {
  const props: RunProps = {}
  for (const element of properties ? childElements(properties) : []) {
    const value = element.attrs.get("w:val")
    switch (element.name) {
      case "w:b":
        props.bold = isOn(value)
        break
      case "w:i":
        props.italic = isOn(value)
        break
      case "w:u":
        props.underline = value?.trim().toLowerCase() !== "none" && isOn(value)
        break
      case "w:strike":
      case "w:dstrike":
        props.strike = props.strike === true || isOn(value)
        break
      case "w:vanish":
        props.hidden = isOn(value)
        break
    }
  }
  return props
}

/** The props, each overridden by the next that sets it. */
function mergeRuns(...layers: RunProps[]): RunProps {
  const merged: RunProps = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer) as [keyof RunProps, boolean | undefined][]) {
      if (value !== undefined) merged[key] = value
    }
  }
  return merged
}

/** A level 0–8 from Word's outline levels as a heading level 1–9; 9, body text, is none. */
function outlineHeading(value: string): number | null {
  const level = Number.parseInt(value, 10)
  return level >= 0 && level < 9 ? level + 1 : null
}

interface StyleSheet {
  defaultParagraph: string | null
  headingLevel(id: string | null): number | null
  isContents(id: string | null): boolean
  /** The paragraph alignment a style sets, itself or by those it's based on. */
  align(id: string | null): string | null
  /** A paragraph style's run props: its own over those it's based on, over the document's defaults. */
  paragraphRun(id: string | null): RunProps
  /** A character style's run props: its own over those it's based on. */
  characterRun(id: string): RunProps
}

function readStyles(root: XmlElement | null): StyleSheet {
  const styles = new Map<string, Style>()
  const sheet = childNamed(root ?? undefined, "w:styles")
  const defaults = runProps(childNamed(childNamed(childNamed(sheet, "w:docDefaults"), "w:rPrDefault"), "w:rPr"))
  let defaultParagraph: string | null = null
  for (const element of sheet ? childElements(sheet) : []) {
    const id = element.name === "w:style" ? element.attrs.get("w:styleId") : undefined
    if (!id) continue
    styles.set(id, {
      name: (childNamed(element, "w:name")?.attrs.get("w:val") ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
      basedOn: childNamed(element, "w:basedOn")?.attrs.get("w:val") ?? null,
      outline: childNamed(childNamed(element, "w:pPr"), "w:outlineLvl")?.attrs.get("w:val") ?? null,
      align: childNamed(childNamed(element, "w:pPr"), "w:jc")?.attrs.get("w:val") ?? null,
      run: runProps(childNamed(element, "w:rPr")),
    })
    const isDefault = element.attrs.get("w:default")
    if (!defaultParagraph && (element.attrs.get("w:type") ?? "paragraph") === "paragraph" && isDefault && isOn(isDefault)) {
      defaultParagraph = id
    }
  }

  /** The style and those it's based on, nearest first. */
  const chain = (id: string | null): Style[] => {
    const found: Style[] = []
    const seen = new Set<string>()
    for (let next = id; next && !seen.has(next) && found.length < 32; ) {
      seen.add(next)
      const style = styles.get(next)
      if (!style) break
      found.push(style)
      next = style.basedOn
    }
    return found
  }

  const runs = new Map<string, RunProps>()
  const styleRun = (id: string) => {
    let props = runs.get(id)
    if (!props) {
      props = mergeRuns(...chain(id).reverse().map((style) => style.run))
      runs.set(id, props)
    }
    return props
  }
  return {
    defaultParagraph,
    headingLevel(id) {
      for (const style of chain(id)) {
        const heading = /^heading ?([1-9])$/.exec(style.name)
        if (heading) return Number(heading[1])
        if (style.name === "title") return 0
        if (style.outline !== null) return outlineHeading(style.outline)
      }
      // Word's own ids, for a document without its styles.
      if (!id || styles.has(id)) return null
      const builtIn = /^heading([1-9])$/i.exec(id)
      return builtIn ? Number(builtIn[1]) : /^title$/i.test(id) ? 0 : null
    },
    isContents(id) {
      if (!id) return false
      const name = styles.get(id)?.name ?? ""
      return /^(toc ?\d|toc heading|table of contents)$/.test(name) || /^toc(\d|heading)$/i.test(id)
    },
    align: (id) => chain(id).find((style) => style.align !== null)?.align ?? null,
    paragraphRun: (id) => (id ? mergeRuns(defaults, styleRun(id)) : defaults),
    characterRun: styleRun,
  }
}

// The document

interface Walk {
  styles: StyleSheet
  pieces: Piece[]
  /** The complex fields open here, innermost last: whether each is past its code and into its result. */
  fields: boolean[]
  /** How many of them are still in their code, whose text is left out. Counted, as fields left open can pile up. */
  inCode: number
}

/** Elements without prose to import: deleted text, properties, and the like. */
const SKIPPED = new Set([
  "w:del",
  "w:moveFrom",
  "w:pPr",
  "w:rPr",
  "w:sdtPr",
  "w:sdtEndPr",
  "w:sectPr",
  "w:tblPr",
  "w:tblGrid",
  "w:trPr",
  "w:tcPr",
  "w:altChunk",
])

/** Whether to look inside: Word's own elements only, so drawings, equations and other add-ons stay out. */
const holdsProse = (node: XmlElement) => node.name.startsWith("w:") && !SKIPPED.has(node.name)

const isTableOfContents = (sdt: XmlElement) =>
  descendantsNamed(childNamed(sdt, "w:sdtPr") ?? sdt, "w:docPartGallery").some((element) =>
    /table of contents/i.test(element.attrs.get("w:val") ?? ""),
  )

function readBlocks(container: XmlElement, walk: Walk) {
  for (const node of container.children) {
    if (!isElement(node) || !holdsProse(node)) continue
    if (node.name === "w:p") readParagraph(node, walk)
    else if (node.name !== "w:sdt" || !isTableOfContents(node)) readBlocks(node, walk)
  }
}

function readParagraph(paragraph: XmlElement, walk: Walk) {
  const properties = childNamed(paragraph, "w:pPr")
  const style = childNamed(properties, "w:pStyle")?.attrs.get("w:val") ?? walk.styles.defaultParagraph
  const outline = childNamed(properties, "w:outlineLvl")?.attrs.get("w:val")
  const level = outline === undefined ? walk.styles.headingLevel(style) : outlineHeading(outline)
  const styleRun = walk.styles.paragraphRun(style)
  // A heading style's bold and the like are how headings look, not words stressed: only its hiding counts.
  const paragraphRun = level === null ? styleRun : { hidden: styleRun.hidden }
  const inlines: Inline[] = []
  // Read even when it's left out, to follow fields that start or end in it.
  readRuns(paragraph, walk, paragraphRun, inlines)
  if (walk.styles.isContents(style)) return
  const align = childNamed(properties, "w:jc")?.attrs.get("w:val") ?? walk.styles.align(style)
  const center = /^center$/i.test(align ?? "")
  const piece = level === null ? paragraphPiece(inlines, center) : headingPiece(level, inlines, center)
  if (piece) walk.pieces.push(piece)
}

function readRuns(container: XmlElement, walk: Walk, paragraphRun: RunProps, out: Inline[]) {
  for (const node of container.children) {
    if (!isElement(node) || !holdsProse(node)) continue
    // Hyperlinks, insertions, content controls, simple fields and the like hold runs.
    if (node.name === "w:r") readRun(node, walk, paragraphRun, out)
    else readRuns(node, walk, paragraphRun, out)
  }
}

function readRun(run: XmlElement, walk: Walk, paragraphRun: RunProps, out: Inline[]) {
  const properties = childNamed(run, "w:rPr")
  const style = childNamed(properties, "w:rStyle")?.attrs.get("w:val") ?? null
  const props = mergeRuns(paragraphRun, style ? walk.styles.characterRun(style) : {}, runProps(properties))
  const marks: MarkName[] = MARKS.filter((mark) => props[mark])
  const add = (inline: Inline) => {
    if (!props.hidden && walk.inCode === 0) out.push(inline)
  }
  for (const node of run.children) {
    if (!isElement(node)) continue
    switch (node.name) {
      case "w:fldChar": {
        const type = node.attrs.get("w:fldCharType")
        const last = walk.fields.length - 1
        if (type === "begin") {
          walk.fields.push(false)
          walk.inCode++
        } else if (type === "separate" && last >= 0 && !walk.fields[last]) {
          walk.fields[last] = true
          walk.inCode--
        } else if (type === "end" && last >= 0 && walk.fields.pop() === false) {
          walk.inCode--
        }
        break
      }
      case "w:t":
        add({ type: "text", text: textContent(node), marks })
        break
      case "w:tab":
      case "w:ptab":
        add({ type: "text", text: " ", marks })
        break
      case "w:noBreakHyphen":
        add({ type: "text", text: "-", marks })
        break
      case "w:br": {
        const type = node.attrs.get("w:type")
        // A page or column break moves the text on; it doesn't break the line.
        if (type !== "page" && type !== "column") add({ type: "lineBreak" })
        break
      }
      case "w:cr":
        add({ type: "lineBreak" })
        break
    }
  }
}

// Details

/** Names Word and other tools put as the author when nobody set one. */
const PLACEHOLDER_AUTHOR = /^(microsoft office user|office user|user|admin|administrator|owner|author|unknown|un-named|python-docx)$/i

function readCore(root: XmlElement | null): { title: string; author: string } {
  const field = (name: string) => {
    const element = root && descendantsNamed(root, name)[0]
    return element ? textContent(element).replace(/\s+/g, " ").trim() : ""
  }
  const author = field("dc:creator")
  return { title: field("dc:title"), author: PLACEHOLDER_AUTHOR.test(author) ? "" : author }
}

/** A .docx file's manuscript. Throws an ImportError if it isn't one. */
export function readDocx(data: Uint8Array): ReadManuscript {
  const rels = unzip(data, (name) => (name.endsWith(".rels") ? MAX_SMALL_BYTES : 0))
  const packageRels = relationships(rels.get("_rels/.rels"))
  const main = related(packageRels, "/officeDocument", "") ?? "word/document.xml"
  const core = related(packageRels, "/core-properties", "") ?? "docprops/core.xml"
  const styles = related(relationships(rels.get(relsOf(main))), "/styles", folderOf(main)) ?? `${folderOf(main)}styles.xml`
  const parts = unzip(data, (name) =>
    name === main ? MAX_DOCUMENT_BYTES : name === styles ? MAX_STYLES_BYTES : name === core ? MAX_SMALL_BYTES : 0,
  )
  const body = childNamed(childNamed(readXml(parts.get(main)) ?? undefined, "w:document"), "w:body")
  if (!body) throw new ImportError(NOT_A_DOCX)
  const walk: Walk = { styles: readStyles(readXml(parts.get(styles))), pieces: [], fields: [], inCode: 0 }
  readBlocks(body, walk)
  return { pieces: walk.pieces, ...readCore(readXml(parts.get(core))) }
}
