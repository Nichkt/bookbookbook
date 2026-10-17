/** A failure the writer can act on, with a message to show them as it is. */
export class ImportError extends Error {
  override name = "ImportError"
}

export const UNSUPPORTED_FILE =
  "Import reads Word (.docx), Markdown (.md) and plain text (.txt) files. Save the manuscript as one of those, then import that."
export const OLD_WORD_FILE =
  "Word’s older .doc files can’t be read. Open it in Word or Google Docs, save it as .docx, then import that."
export const NOT_A_DOCX =
  "That file couldn’t be read as a Word document. Save it again as .docx from Word or Google Docs, then import that."
export const TOO_BIG = "That file is too big to import."
export const NO_TEXT = "There’s no text in that to import."
export const ALL_LEFT_OUT = "Every chapter is left out. Put one back, then import."
