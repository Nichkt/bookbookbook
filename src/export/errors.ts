/** A failure the writer can act on, with a message to show them as it is: "That file isn't a bookbookbook backup." */
export class ExportError extends Error {
  override name = "ExportError"
}
