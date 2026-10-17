import type { Locator, Page } from "@playwright/test"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { expect, openFirstChapter, queryDb, test } from "./fixtures"

const MARKDOWN = `# The Long Tide

by Ada Lane

# Part One

## Chapter 1: Ferry

The ferry nosed into the slip at *dawn*.

* * *

Night came early to the harbour.

## Chapter 2: Harbour

Gulls cried over the grey water.

# Part Two

## Chapter 3: Island

The island rose out of the fog.
`

const PASTE = `Chapter 1: The Crossing

It was cold on the water.

Chapter 2: Landfall

They reached the shore at noon.

Chapter 3: The Lighthouse

The keeper was waiting for them.

Chapter 4: Home

They went home.
`

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

async function openImport(page: Page) {
  await page.getByRole("button", { name: /^Book: / }).click()
  await page.getByRole("menuitem", { name: "Import a manuscript…" }).click()
  const dialog = page.getByRole("dialog", { name: "Import a manuscript" })
  await expect(dialog.getByRole("button", { name: /^Choose a file…/ })).toBeFocused()
  return dialog
}

const chooseFile = (dialog: Locator, name: string, mimeType: string, buffer: Buffer) =>
  dialog.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })

/** The preview's parts. */
function preview(dialog: Locator) {
  const list = dialog.getByRole("list", { name: "Chapters to import" })
  return {
    list,
    summary: dialog.getByText(/^\d+ chapters? · /),
    title: (name: string) => list.getByRole("textbox", { name, exact: true }),
    menu: (name: string) => list.getByRole("button", { name: `More for ${name}`, exact: true }),
  }
}

/** The book's chapters as imported, in order, with their acts and how many scenes each has. */
const importedChapters = (page: Page, title: string) =>
  queryDb(
    page,
    `SELECT c.title, a.title AS act, c.status,
            (SELECT COUNT(*) FROM scenes s WHERE s.chapter_id = c.id AND s.deleted_at IS NULL) AS scenes
       FROM chapters c
       JOIN books b ON b.id = c.book_id
       LEFT JOIN acts a ON a.id = c.act_id
      WHERE b.title = ? AND b.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY c.position`,
    [title],
  )

test("imports a Markdown manuscript as the preview shows it, acts and all", async ({ page }) => {
  await openFirstChapter(page)
  const dialog = await openImport(page)
  await chooseFile(dialog, "the-long-tide.md", "text/markdown", Buffer.from(MARKDOWN))

  const { summary, title } = preview(dialog)
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("The Long Tide")
  await expect(dialog.getByRole("textbox", { name: "Author" })).toHaveValue("Ada Lane")
  await expect(dialog.getByRole("combobox", { name: "Chapters start at" })).toHaveText("Heading 2 (3 chapters)")
  await expect(summary).toHaveText("3 chapters · 2 acts · 4 scenes · 27 words")
  await expect(title("Title of act 1")).toHaveValue("Part One")
  await expect(title("Title of left-out chapter")).toHaveValue("")
  await expect(title("Title of chapter 1")).toHaveValue("Ferry")
  await expect(title("Title of chapter 2")).toHaveValue("Harbour")
  await expect(title("Title of act 2")).toHaveValue("Part Two")
  await expect(title("Title of chapter 3")).toHaveValue("Island")

  const scenes = dialog.getByRole("checkbox", { name: /^Split chapters into scenes/ })
  await scenes.uncheck()
  await expect(summary).toHaveText("3 chapters · 2 acts · 3 scenes · 27 words")
  await dialog.getByRole("button", { name: "Undo" }).click()
  await expect(scenes).toBeChecked()
  await expect(summary).toHaveText("3 chapters · 2 acts · 4 scenes · 27 words")

  await title("Title of chapter 2").fill("The Harbour")
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/b\/[^/]+\/write\/[^/]+$/)
  await expect(page.getByText("Imported “The Long Tide”")).toBeVisible()
  await expect(page.getByRole("button", { name: "Book: The Long Tide" })).toBeVisible()
  const opening = page.getByRole("textbox", { name: "Scene 1", exact: true })
  await expect(opening).toHaveText("The ferry nosed into the slip at dawn.")
  await expect(opening.locator("em")).toHaveText("dawn")
  await expect(page.getByRole("textbox", { name: "Scene 2", exact: true })).toHaveText("Night came early to the harbour.")

  expect(await importedChapters(page, "The Long Tide")).toEqual([
    { title: "Ferry", act: "Part One", status: "drafting", scenes: 2 },
    { title: "The Harbour", act: "Part One", status: "drafting", scenes: 1 },
    { title: "Island", act: "Part Two", status: "drafting", scenes: 1 },
  ])
  expect(await queryDb(page, "SELECT author FROM books WHERE title = ?", ["The Long Tide"])).toEqual([
    { author: "Ada Lane" },
  ])
})

test("imports pasted text after leaving out, merging and grouping chapters, with Undo", async ({ page }) => {
  await openFirstChapter(page)
  const dialog = await openImport(page)
  const paste = dialog.getByRole("textbox", { name: "Or paste the text" })
  await paste.fill(PASTE)
  await dialog.getByRole("button", { name: "Continue" }).click()

  const { summary, title, menu } = preview(dialog)
  await expect(dialog.getByRole("combobox", { name: "Chapters start at" })).toHaveText(
    "Lines like “Chapter 1” (4 chapters)",
  )
  await expect(title("Title of chapter 4")).toHaveValue("Home")

  // Back keeps the paste, to fix rather than paste again.
  await dialog.getByRole("button", { name: "Back" }).click()
  await expect(paste).toHaveValue(PASTE)
  await expect(paste).toBeFocused()
  await dialog.getByRole("button", { name: "Continue" }).click()
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Salt and Stone")
  await expect(summary).toHaveText("4 chapters · 4 scenes · 21 words")

  await menu("chapter 4").click()
  await page.getByRole("menuitem", { name: "Leave out" }).click()
  await expect(summary).toHaveText("3 chapters · 3 scenes · 18 words")
  await expect(menu("left-out chapter")).toBeFocused()
  await dialog.getByRole("button", { name: "Undo" }).click()
  await expect(summary).toHaveText("4 chapters · 4 scenes · 21 words")

  // In a book without acts, the chapters before the new one make a first act.
  await menu("chapter 3").click()
  await page.getByRole("menuitem", { name: "Start an act here" }).click()
  await expect(title("Title of act 2")).toBeFocused()
  await page.keyboard.type("The Light")
  await expect(title("Title of act 1")).toHaveValue("")
  await expect(summary).toHaveText("4 chapters · 2 acts · 4 scenes · 21 words")

  await menu("chapter 2").click()
  await page.getByRole("menuitem", { name: "Merge into the chapter above" }).click()
  await expect(menu("chapter 1")).toBeFocused()
  await expect(summary).toHaveText("3 chapters · 2 acts · 4 scenes · 21 words")

  // Enter goes on to the next title rather than importing.
  await title("Title of act 1").fill("The Sea")
  await page.keyboard.press("Enter")
  await expect(title("Title of chapter 1")).toBeFocused()

  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Imported “Salt and Stone”")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Scene 1", exact: true })).toHaveText("It was cold on the water.")
  // The chapter merged in is a scene now, under its title.
  await expect(page.getByRole("textbox", { name: "Landfall", exact: true })).toHaveText(
    "They reached the shore at noon.",
  )
  expect(await importedChapters(page, "Salt and Stone")).toEqual([
    { title: "The Crossing", act: "The Sea", status: "drafting", scenes: 2 },
    { title: "The Lighthouse", act: "The Light", status: "drafting", scenes: 1 },
    { title: "Home", act: "The Light", status: "drafting", scenes: 1 },
  ])
})

test("imports a Word document, italics and all", async ({ page }) => {
  const document = new Document({
    creator: "Ada Lane",
    sections: [
      {
        children: [
          new Paragraph({ text: "The Long Tide", heading: HeadingLevel.TITLE }),
          new Paragraph({ text: "The Ferry", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [new TextRun("The ferry nosed in at "), new TextRun({ text: "dawn", italics: true }), new TextRun(".")],
          }),
          new Paragraph({ text: "Nightfall", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Night came early." }),
        ],
      },
    ],
  })

  await openFirstChapter(page)
  const dialog = await openImport(page)
  await chooseFile(dialog, "draft.docx", DOCX, await Packer.toBuffer(document))
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("The Long Tide")
  await expect(dialog.getByRole("textbox", { name: "Author" })).toHaveValue("Ada Lane")
  await expect(dialog.getByRole("combobox", { name: "Chapters start at" })).toHaveText("Heading 1 (2 chapters)")
  await dialog.getByRole("button", { name: "Import", exact: true }).click()

  await expect(page.getByText("Imported “The Long Tide”")).toBeVisible()
  const text = page.getByRole("textbox", { name: "Chapter text", exact: true })
  await expect(text).toHaveText("The ferry nosed in at dawn.")
  await expect(text.locator("em")).toHaveText("dawn")
  expect(await importedChapters(page, "The Long Tide")).toEqual([
    { title: "The Ferry", act: null, status: "drafting", scenes: 1 },
    { title: "Nightfall", act: null, status: "drafting", scenes: 1 },
  ])
})

test("says why it can't read a file", async ({ page }) => {
  await openFirstChapter(page)
  const dialog = await openImport(page)
  const alert = dialog.getByRole("alert")

  await chooseFile(dialog, "draft.pdf", "application/pdf", Buffer.from("%PDF-1.7"))
  await expect(alert).toHaveText(
    "Import reads Word (.docx), Markdown (.md) and plain text (.txt) files. Save the manuscript as one of those, then import that.",
  )
  await chooseFile(dialog, "draft.doc", "application/msword", Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
  await expect(alert).toHaveText(
    "Word’s older .doc files can’t be read. Open it in Word or Google Docs, save it as .docx, then import that.",
  )
  await chooseFile(dialog, "draft.docx", DOCX, Buffer.from("not a zip"))
  await expect(alert).toHaveText(
    "That file couldn’t be read as a Word document. Save it again as .docx from Word or Google Docs, then import that.",
  )
  await chooseFile(dialog, "notes.txt", "text/plain", Buffer.from(" \n\n "))
  await expect(alert).toHaveText("There’s no text in that to import.")
})

test("the empty library offers to import a manuscript, which can be dropped in", async ({ page }) => {
  await openFirstChapter(page)
  await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
  await page.getByRole("menuitem", { name: "Book settings…" }).click()
  await page.getByRole("dialog", { name: "Book settings" }).getByRole("button", { name: "Move to Trash" }).click()
  await expect(page.getByRole("heading", { name: "No books yet" })).toBeVisible()

  const opener = page.getByRole("button", { name: "Import a manuscript", exact: true })
  await opener.click()
  const dialog = page.getByRole("dialog", { name: "Import a manuscript" })
  const choose = dialog.getByRole("button", { name: /^Choose a file…/ })
  await expect(choose).toBeFocused()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(opener).toBeFocused()

  await opener.click()
  const dataTransfer = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([text], "the-long-tide.md", { type: "text/markdown" }))
    return transfer
  }, MARKDOWN)
  await choose.dispatchEvent("dragover", { dataTransfer })
  await choose.dispatchEvent("drop", { dataTransfer })
  await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("The Long Tide")
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByRole("button", { name: "Book: The Long Tide" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Scene 1", exact: true })).toHaveText(
    "The ferry nosed into the slip at dawn.",
  )
})
