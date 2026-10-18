import type { Page } from "@playwright/test"
import {
  expect,
  fakeDictation,
  fakeSpeech,
  focusEnd,
  openBookId,
  openFirstChapter,
  openSampleBook,
  queryDb,
  test,
} from "./fixtures"

/** The sample book's notes, the newest first. */
const THOMAS = "What if the last page of the ledger is in Thomas's hand, not their father's?"
const JONAS =
  "Jonas hums the same three bars of a shanty whenever he lies. Plant it on the ferry, pay it off at the Light."

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })
/** The polite live region behind `announce()`. */
const announcer = (page: Page) => page.locator('div.sr-only[role="status"]')
const listButton = (page: Page, list: "sort" | "filed") => page.locator(`[data-inbox-list="${list}"]`)
const toSort = (page: Page) => page.getByRole("list", { name: "To sort" })
const capture = (page: Page) => page.getByRole("textbox", { name: "New note" })

async function openInbox(page: Page) {
  await openSampleBook(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Inbox" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible()
}

/** The id of the open book's note that starts with `start`, once it's saved. */
async function noteId(page: Page, start: string): Promise<string> {
  const find = () =>
    queryDb<{ id: string }>(page, "SELECT id FROM inbox_notes WHERE book_id = ? AND instr(text, ?) = 1", [
      openBookId(page),
      start,
    ])
  await expect.poll(async () => (await find()).length).toBe(1)
  const [row] = await find()
  return row.id
}

const MOMENTS_SQL = `SELECT b.text FROM beats b JOIN chapters c ON c.id = b.parent_id
  WHERE b.parent_kind = 'chapter' AND c.book_id = ? AND c.title = ? ORDER BY b.position`
const moments = async (page: Page, title: string) =>
  (await queryDb<{ text: string }>(page, MOMENTS_SQL, [openBookId(page), title])).map((row) => row.text)

/** Files a note with its File button: into a chapter, as `as` if given, else into a World entry. */
async function fileNote(page: Page, id: string, where: string, as?: "Notes" | "Moments" | "Summary") {
  await page.locator(`[data-inbox-file="${id}"]`).click()
  const dialog = page.getByRole("dialog", { name: "File this note" })
  await dialog.getByRole("combobox", { name: "Where" }).click()
  await page.getByRole("option", { name: where, exact: true }).click()
  if (as) await dialog.getByRole("radio", { name: as }).check()
  await dialog.getByRole("button", { name: "File note" }).click()
  await expect(dialog).toBeHidden()
}

test.describe("Inbox", () => {
  test("adds a note with Enter, files it as moments, and Undo takes them back out", async ({ page }) => {
    await openInbox(page)
    await expect(listButton(page, "sort")).toHaveText("To sort 2")
    await expect(toSort(page).getByRole("listitem")).toHaveCount(2)
    // Only the dictated note says how it came.
    await expect(toSort(page).locator("[data-inbox-dictated]")).toHaveText(["Dictated on this device"])
    await expect(toSort(page).getByRole("listitem").first().getByRole("textbox")).toHaveValue(THOMAS)

    // Shift+Enter starts a new line; with a mouse, Enter adds the note, and the box is ready for the next.
    const box = capture(page)
    await box.fill("- Mara finds the bell rope cut")
    await box.press("Shift+Enter")
    await box.pressSequentially("- Jonas swears he never touched it")
    await box.press("Enter")
    await expect(announcer(page)).toHaveText("Note added")
    await expect(box).toHaveValue("")
    await expect(box).toBeFocused()
    await expect(listButton(page, "sort")).toHaveText("To sort 3")
    const id = await noteId(page, "- Mara finds the bell rope cut")
    const card = toSort(page).getByRole("listitem").first()
    await expect(card).toHaveAttribute("data-inbox-note", id)
    await expect(card.getByRole("textbox")).toHaveValue(
      "- Mara finds the bell rope cut\n- Jonas swears he never touched it",
    )
    await expect(card.locator("[data-inbox-dictated]")).toHaveCount(0)

    // A moment for each line, without the bullets, after the chapter's last.
    const before = await moments(page, "The Ferry Home")
    await card.getByRole("button", { name: /^File “Mara finds the bell rope cut”/ }).click()
    const dialog = page.getByRole("dialog", { name: "File this note" })
    await dialog.getByRole("combobox", { name: "Where" }).click()
    await page.getByRole("option", { name: "Chapter 1: The Ferry Home", exact: true }).click()
    const asMoments = dialog.getByRole("radio", { name: "Moments" })
    await expect(asMoments).toHaveAccessibleDescription("2 moments, one for each line, after its last.")
    await asMoments.check()
    await dialog.getByRole("button", { name: "File note" }).click()
    await expect(dialog).toBeHidden()
    const filed = toast(page, "Added as moments to Chapter 1: The Ferry Home.")
    await expect(filed).toBeVisible()
    await expect
      .poll(() => moments(page, "The Ferry Home"))
      .toEqual([...before, "Mara finds the bell rope cut", "Jonas swears he never touched it"])
    await expect(listButton(page, "sort")).toHaveText("To sort 2")
    await expect(listButton(page, "filed")).toHaveText("Filed 1")
    // Focus moves on to the next note.
    await expect(toSort(page).locator("[data-inbox-file]").first()).toBeFocused()

    await filed.getByRole("button", { name: "Undo" }).click()
    await expect.poll(() => moments(page, "The Ferry Home")).toEqual(before)
    await expect(listButton(page, "sort")).toHaveText("To sort 3")
    await expect(listButton(page, "filed")).toHaveText("Filed 0")
    await expect(page.locator(`[data-inbox-file="${id}"]`)).toBeFocused()
  })

  test("files into a chapter's notes and an entry's, and Filed says where, with a link there", async ({ page }) => {
    await openInbox(page)
    const thomas = await noteId(page, THOMAS)
    const jonas = await noteId(page, JONAS)

    await fileNote(page, thomas, "Chapter 3: The Drowned Bell")
    await expect(toast(page, "Added to the notes of Chapter 3: The Drowned Bell.")).toBeVisible()
    await fileNote(page, jonas, "Jonas Quill")
    await expect(toast(page, "Added to the notes of “Jonas Quill” in the World.")).toBeVisible()
    await expect(page.getByText("All sorted")).toBeVisible()
    await expect(capture(page)).toBeFocused()

    const chapterNotes = await queryDb<{ notes: string }>(
      page,
      "SELECT notes FROM chapters WHERE book_id = ? AND title = 'The Drowned Bell'",
      [openBookId(page)],
    )
    expect(chapterNotes[0].notes.endsWith(THOMAS)).toBe(true)
    // The only book's, as each test starts afresh.
    const entryNotes = await queryDb<{ found: number }>(
      page,
      "SELECT instr(notes, ?) > 0 AS found FROM codex_entries WHERE name = 'Jonas Quill' AND deleted_at IS NULL",
      [JONAS],
    )
    expect(entryNotes).toEqual([{ found: 1 }])

    // The last filed first.
    await listButton(page, "filed").click()
    const filed = page.getByRole("list", { name: "Filed" })
    await expect(filed.locator("[data-inbox-filing]")).toHaveText([
      "Added to the notes of “Jonas Quill” in the World.",
      "Added to the notes of Chapter 3: The Drowned Bell.",
    ])

    await filed.locator(`[data-inbox-filed="${thomas}"]`).getByRole("link", { name: "Show in Plan" }).click()
    await expect(page).toHaveURL(/\/plan\/board\?chapter=/)
    const popout = page.getByRole("dialog", { name: "Chapter 3: The Drowned Bell" })
    await expect(popout.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(/not their father's\?$/)

    await page.goBack()
    await listButton(page, "filed").click()
    await filed.locator(`[data-inbox-filed="${jonas}"]`).getByRole("link", { name: "Show in World" }).click()
    const entry = page.locator("[data-codex-entry]")
    await expect(entry.getByRole("textbox", { name: "Name" })).toHaveValue("Jonas Quill")
    await expect(entry).toContainText(JONAS)
  })

  test("makes a note into a World entry, named from its first line", async ({ page }) => {
    await openInbox(page)
    await capture(page).fill("Saltmarsh Chapel: where the bell was cast.\nRoofless since the flood.")
    await page.getByRole("button", { name: "Add note" }).click()
    const id = await noteId(page, "Saltmarsh Chapel")

    await page.locator(`[data-inbox-world="${id}"]`).click()
    const dialog = page.getByRole("dialog", { name: "Add to World" })
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Saltmarsh Chapel")
    await expect(dialog.getByRole("textbox", { name: "Notes (optional)" })).toHaveValue(
      "where the bell was cast.\nRoofless since the flood.",
    )
    await dialog.getByRole("combobox", { name: "Type" }).click()
    await page.getByRole("option", { name: "Location", exact: true }).click()
    await dialog.getByRole("button", { name: "Add to World" }).click()
    await expect(dialog).toBeHidden()
    await expect(toast(page, "Added “Saltmarsh Chapel” to the World.")).toBeVisible()
    await expect
      .poll(() =>
        queryDb(
          page,
          `SELECT t.key AS type FROM codex_entries e JOIN codex_types t ON t.id = e.type_id
            WHERE e.name = 'Saltmarsh Chapel' AND e.deleted_at IS NULL`,
        ),
      )
      .toEqual([{ type: "locations" }])

    // It's filed, and focus moves on to the next note.
    await expect(listButton(page, "sort")).toHaveText("To sort 2")
    await expect(toSort(page).locator("[data-inbox-file]").first()).toBeFocused()
    await listButton(page, "filed").click()
    const filed = page.locator(`[data-inbox-filed="${id}"]`)
    await expect(filed.locator("[data-inbox-filing]")).toHaveText("Made into “Saltmarsh Chapel” in the World.")
    await filed.getByRole("link", { name: "Show in World" }).click()
    await expect(page.locator("[data-codex-entry]").getByRole("textbox", { name: "Name" })).toHaveValue(
      "Saltmarsh Chapel",
    )
  })

  test("moves a note back to sort and deletes notes, each with Undo, down to an empty Inbox", async ({ page }) => {
    await openInbox(page)
    const thomas = await noteId(page, THOMAS)
    const jonas = await noteId(page, JONAS)
    await fileNote(page, thomas, "Chapter 3: The Drowned Bell")

    // Moved back, it stays where it was filed, and Filed stays in view.
    await listButton(page, "filed").click()
    await page.locator(`[data-inbox-menu="${thomas}"]`).click()
    await page.getByRole("menuitem", { name: /^Move back to To sort/ }).click()
    const movedBack = toast(page, "Moved back to To sort.")
    await expect(movedBack).toBeVisible()
    await expect(page.getByText("Nothing filed yet")).toBeVisible()
    await expect(listButton(page, "sort")).toHaveText("To sort 2")
    const chapterNotes = await queryDb<{ notes: string }>(
      page,
      "SELECT notes FROM chapters WHERE book_id = ? AND title = 'The Drowned Bell'",
      [openBookId(page)],
    )
    expect(chapterNotes[0].notes.endsWith(THOMAS)).toBe(true)
    await movedBack.getByRole("button", { name: "Undo" }).click()
    await expect(page.locator(`[data-inbox-filed="${thomas}"]`)).toBeVisible()
    await expect(page.locator(`[data-inbox-menu="${thomas}"]`)).toBeFocused()

    // Deleted from To sort, and brought back.
    await listButton(page, "sort").click()
    await page.locator(`[data-inbox-menu="${jonas}"]`).click()
    await page.getByRole("menuitem", { name: "Delete note" }).click()
    const deleted = toast(page, "Note deleted.")
    await expect(deleted).toBeVisible()
    await expect(page.getByText("All sorted")).toBeVisible()
    await deleted.getByRole("button", { name: "Undo" }).click()
    await expect(page.locator(`[data-inbox-file="${jonas}"]`)).toBeFocused()

    // Every note gone, the Inbox says what it's for.
    await page.locator(`[data-inbox-menu="${jonas}"]`).click()
    await page.getByRole("menuitem", { name: "Delete note" }).click()
    await expect(page.getByText("All sorted")).toBeVisible()
    await listButton(page, "filed").click()
    await page.locator(`[data-inbox-menu="${thomas}"]`).click()
    await page.getByRole("menuitem", { name: "Delete note" }).click()
    await expect(page.getByText("Nothing filed yet")).toBeVisible()
    await listButton(page, "sort").click()
    await expect(page.getByText("Your Inbox is empty")).toBeVisible()
    await expect
      .poll(() => queryDb(page, "SELECT id FROM inbox_notes WHERE book_id = ?", [openBookId(page)]))
      .toEqual([])
  })
})

test.describe("Quick note", () => {
  test("catches an idea from Write, keeps it while closed, and Show goes to it in the Inbox", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    const open = page.getByRole("button", { name: "Quick note" })
    const dialog = page.getByRole("dialog", { name: "Quick note" })
    const box = dialog.getByRole("textbox", { name: "Quick note" })

    await open.click()
    await expect(box).toBeFocused()
    await page.keyboard.type("Thomas kept a second ledger.")
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(editor).toBeFocused()

    // Still there, to carry on from its end.
    await open.click()
    await expect(box).toHaveValue("Thomas kept a second ledger.")
    await expect(box).toBeFocused()
    await page.keyboard.type(" Under the bell.")
    await dialog.getByRole("button", { name: "Save to Inbox" }).click()
    await expect(dialog).toBeHidden()
    await expect(editor).toBeFocused()
    await expect(editor).not.toContainText("second ledger")

    await toast(page, "Saved to the Inbox.").getByRole("button", { name: "Show" }).click()
    await expect(page).toHaveURL(/\/inbox$/)
    await expect(listButton(page, "sort")).toHaveText("To sort 3")
    await expect(toSort(page).getByRole("listitem").first().getByRole("textbox")).toHaveValue(
      "Thomas kept a second ledger. Under the bell.",
    )

    // Saved, it's gone from Quick note.
    await open.click()
    await expect(box).toHaveValue("")
  })
})

test.describe("Dictation", () => {
  test.beforeEach(({ page }) => fakeDictation(page))

  const pill = (page: Page) => page.getByRole("region", { name: "Dictation", exact: true })
  const say = (page: Page, text: string) => page.evaluate((text) => window.__dictation.say(text), text)
  const hear = (page: Page, text: string) => page.evaluate((text) => window.__dictation.hear(text), text)
  const listening = (page: Page) => page.evaluate(() => window.__dictation.listening())

  /** Sets dictation up, on this device, as the first Dictate opens it to. */
  async function setUp(page: Page) {
    const setup = page.getByRole("dialog", { name: "Set up dictation" })
    await expect(setup.locator("[data-dictation-status]")).toHaveAttribute("data-dictation-status", "available")
    await expect(setup.locator('[data-dictation-engine="on-device"]')).toBeChecked()
    await setup.getByRole("button", { name: "Start dictating" }).click()
    await expect(setup).toBeHidden()
  }

  test("into a note: set up the first time, typed as it's heard, and saved as dictated", async ({ page }) => {
    await openInbox(page)
    const box = capture(page)
    await box.click()
    const dictate = page.locator('[data-dictate="inbox-capture"]')
    await dictate.click()
    await setUp(page)
    await expect(pill(page)).toContainText("Listening · into your note")
    await expect(pill(page)).toContainText("On this device")
    await expect(dictate).toHaveAttribute("aria-pressed", "true")
    await expect(box).toBeFocused()
    expect(await page.evaluate(() => window.__dictation.started)).toEqual({ lang: "en-US", onDevice: true })

    // Words still being heard show in the pill, and are typed once they settle.
    await hear(page, "the bell")
    await expect(pill(page).locator("[data-listening-heard]")).toHaveText("the bell")
    await expect(box).toHaveValue("")
    await say(page, "the bell rang twice new moment nobody pulled the rope period")
    await expect(box).toHaveValue("The bell rang twice\nNobody pulled the rope.")
    await expect(pill(page).locator("[data-listening-heard]")).toHaveCount(0)
    await say(page, "the tide was out")
    await expect(box).toHaveValue("The bell rang twice\nNobody pulled the rope. The tide was out")
    await say(page, "scratch that")
    await expect(box).toHaveValue("The bell rang twice\nNobody pulled the rope.")
    await say(page, "stop listening")
    await expect(pill(page)).toBeHidden()
    await expect(dictate).toHaveAttribute("aria-pressed", "false")
    expect(await listening(page)).toBe(false)

    await page.getByRole("button", { name: "Add note" }).click()
    const id = await noteId(page, "The bell rang twice")
    await expect(page.locator(`[data-inbox-note="${id}"] [data-inbox-dictated]`)).toHaveText(
      "Dictated on this device",
    )
    expect(await queryDb(page, "SELECT source, stt_engine FROM inbox_notes WHERE id = ?", [id])).toEqual([
      { source: "voice-live", stt_engine: "on-device" },
    ])
  })

  test("into the text: at the caret, with its commands, and it and Read aloud stop each other", async ({ page }) => {
    await fakeSpeech(page)
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    const dictate = page.locator('[data-dictate="prose"]')
    await dictate.click()
    await setUp(page)
    await expect(pill(page)).toContainText("Listening · into your scene")
    await expect(dictate).toHaveAttribute("aria-pressed", "true")
    await expect(editor).toBeFocused()

    const paragraphs = editor.locator("p")
    await say(page, "the gulls were loud period")
    await expect(paragraphs.last()).toHaveText(/around an absence\. The gulls were loud\.$/)
    await say(page, "new paragraph she waited")
    await expect(paragraphs).toHaveCount(5)
    await expect(paragraphs.last()).toHaveText("She waited")
    await say(page, "scratch that")
    await expect(paragraphs).toHaveCount(4)
    await expect(paragraphs.last()).toHaveText(/around an absence\. The gulls were loud\.$/)
    await say(page, "stop listening")
    await expect(pill(page)).toBeHidden()
    await expect(dictate).toHaveAttribute("aria-pressed", "false")

    // Ctrl+Shift+M starts and stops it too, leaving the caret in the text.
    await expect(dictate).toHaveAttribute("aria-keyshortcuts", "Control+Shift+M")
    await page.keyboard.press("Control+Shift+M")
    await expect(pill(page)).toContainText("Listening · into your scene")
    await expect(dictate).toHaveAttribute("aria-pressed", "true")
    await expect(editor).toBeFocused()
    await say(page, "the end")
    await expect(paragraphs.last()).toHaveText(/The gulls were loud\. The end$/)
    await page.keyboard.press("Control+Shift+M")
    await expect(pill(page)).toBeHidden()
    await expect(dictate).toHaveAttribute("aria-pressed", "false")
    expect(await listening(page)).toBe(false)

    // The microphone would hear what's read aloud.
    const reading = page.getByRole("region", { name: "Read aloud", exact: true })
    const readAloud = async () => {
      await page.getByRole("button", { name: "More writing tools" }).click()
      await page.getByRole("menuitem", { name: "Read aloud", exact: true }).click()
      await expect(reading).toBeVisible()
    }
    await readAloud()
    await dictate.click()
    await expect(pill(page)).toContainText("Listening · into your scene")
    await expect(reading).toBeHidden()
    await readAloud()
    await expect(pill(page)).toBeHidden()
    expect(await listening(page)).toBe(false)
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test("Dictate and Quick note fit in Write's bars", async ({ page }) => {
      await openFirstChapter(page)
      await expect(page.locator('[data-dictate="prose"]')).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole("button", { name: "More writing tools" })).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole("button", { name: "Quick note" })).toBeInViewport({ ratio: 1 })
    })
  })
})
