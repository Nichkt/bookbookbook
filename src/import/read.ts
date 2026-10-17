import { readDocx } from "./docx"
import { ImportError, NO_TEXT, OLD_WORD_FILE, TOO_BIG, UNSUPPORTED_FILE } from "./errors"
import { readMarkdown } from "./markdown"
import type { ReadManuscript } from "./pieces"
import { decodeText, guessParagraphing, readPlainText, type Paragraphing } from "./text"

/*
 * Reading a manuscript to import (DESIGN.md §13): from a Word, Markdown or plain text file the writer chose or
 * dropped, or from text they pasted, read as Markdown when it has Markdown's headings.
 */

export type SourceKind = "docx" | "markdown" | "text" | "paste"

export interface ImportSource {
  kind: SourceKind
  /** The file's name without its extension: "" for a paste. */
  name: string
  manuscript: ReadManuscript
  /** Plain text: the text, to read again with its paragraphs parted another way. */
  text?: string
  paragraphing?: Paragraphing
}

export const MAX_TEXT_BYTES = 32 * 1024 * 1024
export const MAX_DOCX_BYTES = 256 * 1024 * 1024

/** The file types import reads, for a file input's `accept`. */
export const IMPORT_ACCEPT = ".docx,.md,.markdown,.txt,.text"

/** What kind of file it is, by its name: an ImportError for a kind import can't read. */
export function fileKind(name: string): "docx" | "markdown" | "text" {
  const extension = /\.([^./\\]+)$/.exec(name)?.[1].toLowerCase() ?? ""
  switch (extension) {
    case "docx":
      return "docx"
    case "md":
    case "markdown":
      return "markdown"
    case "txt":
    case "text":
      return "text"
    case "doc":
      throw new ImportError(OLD_WORD_FILE)
    default:
      throw new ImportError(UNSUPPORTED_FILE)
  }
}

const fileStem = (name: string) =>
  name
    .replace(/^.*[/\\]/, "")
    .replace(/\.[^.]*$/, "")
    .trim()

const maxBytes = (kind: SourceKind) => (kind === "docx" ? MAX_DOCX_BYTES : MAX_TEXT_BYTES)

function checked(source: ImportSource): ImportSource {
  const pieces = source.manuscript.pieces
  if (!pieces.some((piece) => piece.type === "heading" || piece.block.type !== "break")) throw new ImportError(NO_TEXT)
  return source
}

const plainSource = (kind: SourceKind, name: string, text: string, paragraphing: Paragraphing): ImportSource =>
  checked({ kind, name, text, paragraphing, manuscript: { pieces: readPlainText(text, paragraphing), title: "", author: "" } })

/** The manuscript in a file's bytes. */
export function readSource(fileName: string, bytes: Uint8Array): ImportSource {
  const kind = fileKind(fileName)
  const name = fileStem(fileName)
  if (bytes.length > maxBytes(kind)) throw new ImportError(TOO_BIG)
  if (kind === "docx") return checked({ kind, name, manuscript: readDocx(bytes) })
  const text = decodeText(bytes)
  if (kind === "markdown") return checked({ kind, name, manuscript: readMarkdown(text) })
  return plainSource(kind, name, text, guessParagraphing(text))
}

/** The manuscript in a file the writer chose or dropped. */
export async function readFile(file: Pick<File, "name" | "size" | "arrayBuffer">): Promise<ImportSource> {
  if (file.size > maxBytes(fileKind(file.name))) throw new ImportError(TOO_BIG)
  return readSource(file.name, new Uint8Array(await file.arrayBuffer()))
}

const MARKDOWN_HEADING = /^#{1,6}[ \t]+\S/m

/** The manuscript in text the writer pasted. */
export function readPaste(text: string): ImportSource {
  if (MARKDOWN_HEADING.test(text)) return checked({ kind: "paste", name: "", manuscript: readMarkdown(text) })
  return plainSource("paste", "", text, guessParagraphing(text))
}

/** Plain text read again, with its paragraphs parted another way. */
export function withParagraphing(source: ImportSource, paragraphing: Paragraphing): ImportSource {
  return source.text === undefined ? source : plainSource(source.kind, source.name, source.text, paragraphing)
}
