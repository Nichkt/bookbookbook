import type { Page } from "@playwright/test"
import { expect, flushAll, focusEnd, openFirstChapter, queryDb, selectText, settleAll, test } from "./fixtures"

const view = (page: Page, name: "Scene" | "Chapter" | "Manuscript") =>
  page.getByRole("radiogroup", { name: "Write view" }).getByRole("radio", { name })

const chapterLink = (page: Page, number: number) =>
  page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: new RegExp(`^Chapter ${number}:`) })

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })

const chapterSection = (page: Page, number: number) => page.locator("[data-write-chapter]").nth(number - 1)
const chapterId = (page: Page, number: number) => chapterSection(page, number).getAttribute("data-write-chapter")
/** Where a chapter starts in the window. A jump puts it 8rem down, clear of the header and toolbar. */
const chapterTop = (page: Page, number: number) =>
  chapterSection(page, number).evaluate((section) => Math.round(section.getBoundingClientRect().top))

test("the Scene view pages through the book's scenes, across chapters, and is remembered", async ({ page }) => {
  await openFirstChapter(page)
  await view(page, "Scene").click()
  await expect(view(page, "Scene")).toBeChecked()

  const pager = page.getByRole("navigation", { name: "Scene pages" })
  await expect(pager.getByRole("link", { name: /^Next/ })).toContainText(
    "Chapter 2: The Keeper's Room · Scene 1: The locked room",
  )
  await pager.getByRole("link", { name: /^Next/ }).click()
  await expect(page.getByRole("heading", { level: 1, name: "The Keeper's Room" })).toBeFocused()
  await expect(page.getByRole("textbox", { name: "The locked room" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toHaveCount(0)

  await pager.getByRole("link", { name: /^Next/ }).click()
  await expect(page.getByRole("textbox", { name: "A key in the spine" })).toBeVisible()
  await pager.getByRole("link", { name: /^Previous/ }).click()
  await expect(page.getByRole("textbox", { name: "The locked room" })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("textbox", { name: "The locked room" })).toBeVisible()
  await expect(view(page, "Scene")).toBeChecked()
})

test("the Manuscript is the whole book, and the URL follows the chapter being read", async ({ page }) => {
  await openFirstChapter(page)
  await view(page, "Manuscript").click()
  await expect(page.getByRole("heading", { level: 1, name: "The Salt Ledger" })).toBeVisible()

  await chapterLink(page, 3).click()
  await expect.poll(() => chapterTop(page, 3)).toBe(128)
  await expect(chapterLink(page, 3)).toHaveAttribute("aria-current", "page")
  // Placeholders guess at the height of the text above until its editors are up; the jump holds through that.
  await expect(page.getByRole("textbox", { name: "A key in the spine" })).toBeAttached()
  await expect(page.getByRole("textbox", { name: "The locked room" })).toBeAttached()
  expect(await chapterTop(page, 3)).toBe(128)
  await expect(chapterLink(page, 3)).toHaveAttribute("aria-current", "page")

  // Reading on into chapter 4 takes the URL, and the navigator, with it. Its heading is for screen readers; its
  // title field is what shows.
  await expect(page.getByRole("heading", { level: 2, name: "Low Tide" })).toBeAttached()
  const lowTide = page.getByRole("textbox", { name: "Title of chapter 4" })
  await expect(lowTide).toHaveValue("Low Tide")
  const distance = await lowTide.evaluate((title) => title.getBoundingClientRect().top - 150)
  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, distance)
  await expect(chapterLink(page, 4)).toHaveAttribute("aria-current", "page")
  await expect(page).toHaveURL(new RegExp(`/write/${await chapterId(page, 4)}$`))

  await page.reload()
  await expect(page.getByRole("textbox", { name: "Title of chapter 4" })).toBeInViewport()
})


test("with no scene focused, the toolbar acts on the scene filling the window", async ({ page }) => {
  await openFirstChapter(page)
  await view(page, "Manuscript").click()
  await chapterLink(page, 3).click()
  await expect(page.getByRole("textbox", { name: "Pub light" })).toBeInViewport()
  await page.getByRole("button", { name: "History", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "History of “Pub light”" })).toBeVisible()
})

test("the toolbar formats the text being written, and a scene break stays put", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  await page.keyboard.press("Enter")
  const bold = page.getByRole("button", { name: "Bold" })
  await bold.click()
  await expect(bold).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.type("Loud")
  await bold.click()
  await page.getByRole("button", { name: "Scene break" }).click()
  await page.keyboard.type("After the break.")
  await expect(editor.locator("strong")).toHaveText("Loud")
  await expect(editor.locator("hr + p")).toHaveText("After the break.")

  await flushAll(page)
  await page.reload()
  const again = page.getByRole("textbox", { name: "Ferry wake" })
  await expect(again.locator("strong")).toHaveText("Loud")
  await expect(again.locator("hr + p")).toHaveText("After the break.")
})

test("a scene gets a name, a new scene follows it, and Undo brings one back from the Trash", async ({ page }) => {
  await openFirstChapter(page)
  await chapterLink(page, 3).click()
  await expect(page.getByRole("heading", { level: 1, name: "The Drowned Bell" })).toBeVisible()

  const title = page.getByRole("textbox", { name: "Title of scene 1 in chapter 3" })
  await title.fill("Pub lights")
  await title.press("Enter")
  await expect(page.getByRole("textbox", { name: "Pub lights" })).toBeFocused()

  await page.getByRole("button", { name: "Add scene" }).click()
  await expect(page.getByRole("textbox", { name: "Title of scene 3 in chapter 3" })).toBeFocused()
  await page.keyboard.type("The walk home")
  await page.keyboard.press("Enter")
  const text = page.getByRole("textbox", { name: "The walk home" })
  await expect(text).toBeFocused()
  await page.keyboard.type("Rain followed them up the hill.")
  await flushAll(page)

  await page.getByRole("button", { name: "More for scene 3 in chapter 3" }).click()
  await page.getByRole("menuitem", { name: "Move to Trash" }).click()
  await expect(text).toHaveCount(0)
  await toast(page, "Moved “The walk home” to the Trash").getByRole("button", { name: "Undo" }).click()
  await expect(page.getByRole("textbox", { name: "The walk home" })).toHaveText("Rain followed them up the hill.")
})

test("the chapter's title and summary are changed in place, in the plan too, and Undo takes them back", async ({
  page,
}) => {
  await openFirstChapter(page)
  await chapterLink(page, 3).click()
  const title = page.getByRole("textbox", { name: "Title of chapter 3" })
  const summary = page.getByRole("textbox", { name: "Summary of chapter 3" })
  await expect(title).toHaveValue("The Drowned Bell")
  const before = await summary.inputValue()
  expect(before).toMatch(/^At the Drowned Bell, Mara tests the ledger/)
  const id = await title.getAttribute("data-write-chapter-title")
  const saved = async () =>
    (await queryDb<{ title: string; summary: string }>(page, "SELECT title, summary FROM chapters WHERE id = ?", [id]))[0]

  // A title is one line: a line break pasted in becomes a space, and Enter goes on to the summary.
  await title.fill("The Drowned\nBell Tolls")
  await expect(title).toHaveValue("The Drowned Bell Tolls")
  await title.press("Enter")
  await expect(summary).toBeFocused()
  await summary.fill("Mara hears the bell from the harbour.")
  await flushAll(page)
  await expect.poll(saved).toEqual({ title: "The Drowned Bell Tolls", summary: "Mara hears the bell from the harbour." })
  await expect(chapterLink(page, 3)).toContainText("The Drowned Bell Tolls")
  await expect(page.getByRole("heading", { level: 1, name: "The Drowned Bell Tolls" })).toBeAttached()

  const undo = page.getByRole("banner").getByRole("button", { name: "Undo", exact: true })
  await expect(undo).toHaveAttribute("title", "Undo: Changed the summary of “The Drowned Bell Tolls” · Ctrl+Z")
  await undo.click()
  await expect(summary).toHaveValue(before)
  await undo.click()
  await expect(title).toHaveValue("The Drowned Bell")
  await expect.poll(saved).toEqual({ title: "The Drowned Bell", summary: before })

  const redo = page.getByRole("banner").getByRole("button", { name: "Redo", exact: true })
  await redo.click()
  await redo.click()
  await expect(summary).toHaveValue("Mara hears the bell from the harbour.")
  await page.getByRole("link", { name: "Plan chapter 3" }).click()
  const popout = page.getByRole("dialog", { name: "Chapter 3: The Drowned Bell Tolls" })
  await expect(popout.getByRole("textbox", { name: "Chapter title" })).toHaveValue("The Drowned Bell Tolls")
  await expect(popout.getByRole("textbox", { name: "Summary" })).toHaveValue("Mara hears the bell from the harbour.")
})

test("History keeps versions: a named snapshot comes back with Restore, and Undo reverses that", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  await page.keyboard.type(" The gulls followed.")

  const history = page.getByRole("button", { name: "History", exact: true })
  await history.click()
  const dialog = page.getByRole("dialog", { name: "History of “Ferry wake”" })
  await dialog.getByLabel("Snapshot name (optional)").fill("Gulls")
  await dialog.getByRole("button", { name: "Take snapshot" }).click()
  await expect(toast(page, "Saved “Gulls”, a snapshot of “Ferry wake”")).toBeVisible()
  await expect(dialog.getByRole("button", { name: /^Gulls\b/ })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(history).toBeFocused()

  await focusEnd(editor)
  await page.keyboard.type(" Then the rain.")
  await history.click()
  await dialog.getByRole("button", { name: /^Gulls\b/ }).click()
  await expect(dialog.getByText(/^Restoring takes out \d+ words\.$/)).toBeVisible()
  await expect(dialog.getByRole("deletion")).toHaveText([/Then the rain\./])
  await dialog.getByRole("button", { name: "Restore this version" }).click()
  await expect(dialog).toBeHidden()
  await expect(editor).toContainText("The gulls followed.")
  await expect(editor).not.toContainText("Then the rain.")

  await toast(page, "Restored “Ferry wake” to “Gulls”").getByRole("button", { name: "Undo" }).click()
  await expect(editor).toContainText("The gulls followed. Then the rain.")
})

/** Enough of a scene's editor, as the page holds it, to undo and to read the caret. */
interface SceneEditorHandle {
  state: { selection: { from: number; to: number }; plugins: { key: string; getState(state: unknown): unknown }[] }
  commands: { undo(): boolean }
}
/** The editor's link to the scene's shared text, through which another tab's edits arrive. */
interface SyncBinding {
  doc: { transact(change: () => void, origin: string): void }
  type: { get(index: number): { get(index: number): { insert(index: number, text: string): void } } }
}

test("an edit from another tab, just after an undo, leaves the caret where it was", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await selectText(editor, "tired")
  await page.keyboard.type("weary")
  await focusEnd(editor)
  const caret = await editor.evaluate(async (element) => {
    const scene = (element as unknown as { editor: SceneEditorHandle }).editor
    const sync = scene.state.plugins.find((plugin) => plugin.key.startsWith("y-sync"))
    if (!sync) throw new Error("The editor has no y-sync plugin")
    const { binding } = sync.getState(scene.state) as { binding: SyncBinding }
    scene.commands.undo()
    const before = scene.state.selection.from
    await new Promise((resolve) => setTimeout(resolve, 0))
    binding.doc.transact(() => binding.type.get(0).get(0).insert(0, "X"), "another tab")
    const { from, to } = scene.state.selection
    return { before, from, to }
  })
  // Moved on by the X, rather than back to where the undone typing began.
  expect(caret).toEqual({ before: caret.before, from: caret.before + 1, to: caret.before + 1 })
  await expect(editor).toContainText("XThe ferry nosed")
  await expect(editor).toContainText("the tired certainty")
})

test("Today counts the words written in the book", async ({ page }) => {
  const editor = await openFirstChapter(page)
  const today = page.getByRole("button", { name: /^Today:/ })
  await expect(today).toContainText("Today +0")
  await focusEnd(editor)
  await page.keyboard.type(" Five more words go here.")
  await settleAll(page)
  await expect(today).toContainText("Today +5")
  await expect(today).toHaveAccessibleName("Today: 5 words added, 0 removed")
})

test("the chapter plan sits beside the text, and pops the chapter out in the Plan", async ({ page }) => {
  await openFirstChapter(page)
  await page.getByRole("button", { name: "Chapter plan" }).click()
  const panel = page.getByRole("complementary", { name: "Chapter details" })
  await expect(panel.getByRole("heading", { name: "Chapter 1", exact: true })).toBeFocused()
  await expect(panel.getByRole("textbox", { name: "Chapter title" })).toHaveValue("The Ferry Home")

  // It stays open across visits on a wide screen, once that's saved.
  await expect
    .poll(() => queryDb<{ value: string }>(page, "SELECT value FROM ui_prefs WHERE id = 'write.panel'"))
    .toEqual([{ value: "plan" }])
  await page.reload()
  await expect(panel.getByRole("textbox", { name: "Chapter title" })).toHaveValue("The Ferry Home")

  await panel.getByRole("link", { name: "Open in Plan" }).click()
  await expect(page).toHaveURL(/\/plan\/board\?chapter=/)
  const popout = page.getByRole("dialog", { name: "Chapter 1: The Ferry Home" })
  await expect(popout.getByRole("heading", { name: "Chapter 1", exact: true })).toBeVisible()
})
