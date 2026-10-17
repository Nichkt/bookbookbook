import { readFile } from "node:fs/promises"
import type { Page } from "@playwright/test"
import { strFromU8, unzipSync } from "fflate"
import { expect, focusEnd, openFirstChapter, queryDb, test } from "./fixtures"

async function openExport(page: Page) {
  await page.getByRole("button", { name: /^Book: / }).click()
  await page.getByRole("menuitem", { name: "Export…" }).click()
  const dialog = page.getByRole("dialog", { name: "Export" })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Clicks Export and waits for the file it downloads. */
async function exportFile(page: Page) {
  const downloading = page.waitForEvent("download")
  await page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: "Export" }).click()
  const download = await downloading
  return { name: download.suggestedFilename(), data: new Uint8Array(await readFile(await download.path())) }
}

const unzipText = (data: Uint8Array) =>
  Object.fromEntries(Object.entries(unzipSync(data)).map(([name, bytes]) => [name, strFromU8(bytes)]))

test("exports a Word manuscript with the last words typed, and saves the author with the book", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  await page.keyboard.type(" The gulls followed.")

  const dialog = await openExport(page)
  await expect(dialog.getByRole("radio", { name: "Word manuscript" })).toBeChecked()
  await expect(dialog.getByRole("radio", { name: "Word manuscript" })).toBeFocused()
  await dialog.getByRole("textbox", { name: "Author" }).fill("Ann Lee")
  await dialog.getByRole("radio", { name: "Courier New" }).click()
  await dialog.getByRole("radio", { name: "A4" }).click()
  const file = await exportFile(page)
  expect(file.name).toBe("The Salt Ledger.docx")
  await expect(dialog).toBeHidden()
  await expect(page.getByText("Exported “The Salt Ledger.docx”")).toBeVisible()

  const files = unzipText(file.data)
  const xml = files["word/document.xml"]
  for (const text of ["by Ann Lee", "The Ferry Home", "The ferry nosed", "The gulls followed."]) {
    expect(xml).toContain(text)
  }
  expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"')
  expect(files["word/styles.xml"]).toContain("Courier New")
  const headers = Object.keys(files).filter((name) => /^word\/header\d*\.xml$/.test(name))
  expect(headers.map((name) => files[name]).join("")).toContain("Lee / THE SALT LEDGER / ")

  expect(await queryDb(page, "SELECT author FROM books WHERE deleted_at IS NULL")).toEqual([{ author: "Ann Lee" }])
  await openExport(page)
  await expect(dialog.getByRole("textbox", { name: "Author" })).toHaveValue("Ann Lee")
  await expect(dialog.getByRole("radio", { name: "Courier New" })).toBeChecked()
})

test("exports Markdown as one file or a file per chapter, and remembers the choices", async ({ page }) => {
  await openFirstChapter(page)
  const dialog = await openExport(page)
  await dialog.getByRole("radio", { name: "Markdown" }).check()
  await expect(dialog.getByRole("textbox", { name: "Author" })).toBeHidden()
  const book = await exportFile(page)
  expect(book.name).toBe("The Salt Ledger.md")
  const markdown = strFromU8(book.data)
  expect(markdown.startsWith("# The Salt Ledger\n\n## Chapter 1: The Ferry Home\n\nThe ferry nosed")).toBe(true)

  await openExport(page)
  await expect(dialog.getByRole("radio", { name: "Markdown" })).toBeChecked()
  await expect(dialog.getByRole("radio", { name: "Markdown" })).toBeFocused()
  await dialog.getByRole("combobox", { name: "Chapter headings" }).click()
  await page.getByRole("option", { name: "Title only" }).click()
  await dialog.getByRole("checkbox", { name: "A file per chapter, in a zip" }).check()
  const zip = await exportFile(page)
  expect(zip.name).toBe("The Salt Ledger (Markdown).zip")
  const chapters = unzipText(zip.data)
  expect(Object.keys(chapters)[0]).toBe("01 The Ferry Home.md")
  expect(chapters["01 The Ferry Home.md"].startsWith("# The Ferry Home\n\nThe ferry nosed")).toBe(true)

  await openExport(page)
  await expect(dialog.getByRole("combobox", { name: "Chapter headings" })).toHaveText("Title only")
  await expect(dialog.getByRole("checkbox", { name: "A file per chapter, in a zip" })).toBeChecked()
})

test("backs up a book and restores it beside the original", async ({ page }) => {
  await openFirstChapter(page)
  const dialog = await openExport(page)
  await dialog.getByRole("radio", { name: "Backup" }).check()
  await expect(dialog.getByText("One zip with everything in this book")).toBeVisible()
  const backup = await exportFile(page)
  expect(backup.name).toMatch(/^The Salt Ledger \d{4}-\d{2}-\d{2}\.bookbookbook\.zip$/)

  await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
  await page.getByRole("menuitem", { name: "Restore from backup…" }).click()
  const restore = page.getByRole("dialog", { name: "Restore from backup" })
  await expect(restore.getByRole("button", { name: "Choose a backup…" })).toBeFocused()
  const input = restore.locator('input[type="file"]')
  await input.setInputFiles({ name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") })
  await expect(restore.getByRole("alert")).toHaveText("That file isn't a bookbookbook backup.")

  await input.setInputFiles({ name: backup.name, mimeType: "application/zip", buffer: Buffer.from(backup.data) })
  await expect(restore).toBeHidden()
  await expect(page.getByRole("button", { name: "Book: The Salt Ledger (restored)" })).toBeVisible()
  await expect(page.getByText("Restored “The Salt Ledger (restored)”")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toContainText("The ferry nosed")
  const chapters = page.getByRole("navigation", { name: "Chapters" })
  await expect(chapters.getByRole("link", { name: /^Chapter \d+:/ })).toHaveCount(12)
  const titles = await queryDb<{ title: string }>(page, "SELECT title FROM books WHERE deleted_at IS NULL ORDER BY title")
  expect(titles.map((row) => row.title)).toEqual(["The Salt Ledger", "The Salt Ledger (restored)"])
  // A book restored is as safe as its backup.
  await page.getByRole("button", { name: "Book: The Salt Ledger (restored)" }).click()
  await expect(page.getByRole("menuitem", { name: /^Backups…/ })).toContainText("Last backup: Today")
})

test("says so when a book has nothing to export yet", async ({ page }) => {
  await openFirstChapter(page)
  await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
  await page.getByRole("menuitem", { name: "New book…" }).click()
  const newBook = page.getByRole("dialog", { name: "New book" })
  await newBook.getByRole("textbox", { name: "Title", exact: true }).fill("Blank Pages")
  await newBook.getByRole("button", { name: "Create book" }).click()
  await expect(page.getByRole("button", { name: "Book: Blank Pages" })).toBeVisible()

  const dialog = await openExport(page)
  await dialog.getByRole("button", { name: "Export" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("There's nothing to export yet. Write a scene, then try again.")
  await dialog.getByRole("radio", { name: "Plain text" }).check()
  await expect(dialog.getByRole("alert")).toBeHidden()
})

test("the empty library offers to restore a backup", async ({ page }) => {
  await openFirstChapter(page)
  await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
  await page.getByRole("menuitem", { name: "Book settings…" }).click()
  await page.getByRole("dialog", { name: "Book settings" }).getByRole("button", { name: "Move to Trash" }).click()
  await expect(page.getByRole("heading", { name: "No books yet" })).toBeVisible()

  await page.getByRole("button", { name: "Books", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "Export…" })).toBeDisabled()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Restore from backup" }).click()
  const restore = page.getByRole("dialog", { name: "Restore from backup" })
  await expect(restore.getByRole("button", { name: "Choose a backup…" })).toBeFocused()
  await restore.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("button", { name: "Restore from backup" })).toBeFocused()
})
