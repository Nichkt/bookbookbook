import type { ExportFile } from "./files"

/** Hands a file to the browser to save, as a download. */
export function downloadFile(file: ExportFile) {
  // Our bytes never sit on a SharedArrayBuffer, which is all the typings' objection is about.
  const blob = new Blob([file.data as BlobPart], { type: file.type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
