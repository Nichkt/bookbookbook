import type { Locator, Page } from "@playwright/test"
import {
  expect,
  fakeAi,
  FIRST_LOAD_TIMEOUT,
  focusEnd,
  LOCAL_AI,
  openFirstChapter,
  setUpLocalAi,
  test,
} from "./fixtures"

const palette = (page: Page) => page.getByRole("dialog", { name: "Search" })
const searchInput = (page: Page) => palette(page).getByRole("combobox", { name: "Search" })
const searchButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Search", exact: true })
const option = (page: Page, name: RegExp) => palette(page).getByRole("option", { name })

/** Where the caret is in a scene's text. */
const caretIn = (editor: Locator) =>
  editor.evaluate(
    (element) =>
      (element as HTMLElement & { editor: { state: { selection: { from: number } } } }).editor.state.selection.from,
  )

/** Opens Search with Ctrl+K and picks `name` with Enter, once a search for `search` has it first. */
async function pick(page: Page, search: string, name: RegExp) {
  await page.keyboard.press("Control+k")
  await expect(searchInput(page)).toBeFocused()
  await page.keyboard.type(search)
  await expect(option(page, name)).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")
  await expect(palette(page)).toBeHidden()
}

test("Ctrl+K opens Search over the text and closes it again, with the caret where it was", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  const caret = await caretIn(editor)

  await page.keyboard.press("Control+k")
  await expect(searchInput(page)).toBeFocused()
  await expect(option(page, /^Focus mode/)).toBeVisible()
  await page.keyboard.press("Control+k")
  await expect(palette(page)).toBeHidden()
  await expect(editor).toBeFocused()
  expect(await caretIn(editor)).toBe(caret)

  await page.keyboard.press("Control+k")
  await page.keyboard.type("zzzz")
  await expect(palette(page)).toContainText("Nothing found for “zzzz”")
  await page.keyboard.press("Escape")
  await expect(palette(page)).toBeHidden()
  await expect(editor).toBeFocused()
  expect(await caretIn(editor)).toBe(caret)
  await expect(editor).not.toContainText("zzzz")

  // Opened again as it fades away, it starts afresh, and focus still goes back to the text after.
  await page.keyboard.press("Control+k")
  await page.keyboard.type("dark")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Control+k")
  await expect(searchInput(page)).toBeFocused()
  await expect(searchInput(page)).toHaveValue("")
  await page.keyboard.press("Escape")
  await expect(palette(page)).toBeHidden()
  await expect(editor).toBeFocused()
  expect(await caretIn(editor)).toBe(caret)
})

test("on Write, goes to a chapter's heading and opens a World entry beside the text", async ({ page }) => {
  await openFirstChapter(page)

  await pick(page, "keeper", /^2\. The Keeper's Room/)
  await expect(page.getByRole("heading", { name: "The Keeper's Room" })).toBeFocused()

  await pick(page, "agnes", /^Agnes Morrow/)
  await expect(page.locator("[data-codex-panel-heading]:focus")).toContainText("Agnes Morrow")
})

test("on the Plan, pops out a chapter, switches views, and goes to a scene to write it", async ({ page }) => {
  await openFirstChapter(page)
  await pick(page, "plan", /^Plan$/)
  await expect(page).toHaveURL(/\/plan/)

  await pick(page, "keeper", /^2\. The Keeper's Room/)
  await expect(page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" })).toBeVisible()
  await expect(page.locator("[data-drawer-heading]")).toBeFocused()
  await expect(page).toHaveURL(/\?chapter=/)
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-chapter-popout]")).toBeHidden()

  await pick(page, "outline", /^Plan: Outline/)
  await expect(page).toHaveURL(/\/plan\/outline/)
  await page.keyboard.press("Control+k")
  await page.keyboard.type("plan: outline")
  await expect(option(page, /^Plan: Outline/)).toHaveAttribute("data-checked", "true")
  await page.keyboard.press("Escape")

  await pick(page, "ferry wake", /^Ferry wake/)
  await expect(page).toHaveURL(/\/write\/[^/]+\/[^/]+$/)
  const scene = page.getByRole("textbox", { name: "Ferry wake" })
  await expect(scene).toBeFocused()
  expect(await caretIn(scene)).toBe(1)
})

test("on World, goes to an entry, and Back closes it", async ({ page }) => {
  await openFirstChapter(page)
  await pick(page, "world", /^World$/)
  await expect(page).toHaveURL(/\/world/)

  await pick(page, "agnes", /^Agnes Morrow/)
  await expect(page).toHaveURL(/\/world\/[^/]+$/)
  await expect(page.locator("[data-codex-row]").filter({ hasText: "Agnes Morrow" })).toBeFocused()

  // The browser's Back goes to another page, and closes it.
  await page.keyboard.press("Control+k")
  await expect(searchInput(page)).toBeFocused()
  await page.goBack()
  await expect(palette(page)).toBeHidden()
})

test("runs what a page does, and a dialog it opens gives focus back to the text", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  const caret = await caretIn(editor)

  await pick(page, "focus", /^Focus mode Ctrl/)
  const exit = page.getByRole("button", { name: "Exit focus mode" })
  await expect(exit).toBeVisible()
  await expect(editor).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(exit).toBeHidden()

  await pick(page, "dark", /^Dark theme/)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(editor).toBeFocused()
  await page.keyboard.press("Control+k")
  await page.keyboard.type("theme")
  await expect(option(page, /^Dark theme/)).toHaveAttribute("data-checked", "true")
  await expect(option(page, /^Light theme/)).not.toHaveAttribute("data-checked", "true")
  await page.keyboard.press("Escape")

  await pick(page, "book settings", /^Book settings/)
  const settings = page.getByRole("dialog", { name: "Book settings" })
  await expect(settings).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(settings).toBeHidden()
  await expect(editor).toBeFocused()
  expect(await caretIn(editor)).toBe(caret)
})

test("Ctrl+K leaves another dialog alone", async ({ page }) => {
  await openFirstChapter(page)
  await page.getByRole("button", { name: "Glossary" }).click()
  const glossary = page.getByRole("dialog", { name: "Glossary" })
  const find = glossary.getByRole("searchbox")
  await find.click()
  await page.keyboard.press("Control+k")
  await page.keyboard.type("moment")
  await expect(find).toHaveValue("moment")
  await expect(find).toBeFocused()
  await expect(palette(page)).toHaveCount(0)
})

test("picks an AI tool without running it, and runs Continue", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await setUpLocalAi(page)
  await focusEnd(editor)

  await pick(page, "brainstorm", /^Brainstorm/)
  const panel = page.getByRole("complementary", { name: "AI tools" })
  const tool = panel.locator("[data-ai-tool]")
  await expect(tool).toBeFocused()
  await expect(tool).toHaveText("Brainstorm")
  await expect(panel.getByRole("button", { name: "Run Brainstorm" })).toBeVisible()
  expect(ai.sent).toHaveLength(0)

  await focusEnd(editor)
  await pick(page, "continue", /^Continue/)
  await expect(panel.locator('[data-ai-card-status="done"]')).toHaveCount(1)
  expect(ai.sent.length).toBeGreaterThan(0)
})

test("on the home screen, opens a book and explains a word", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
  await searchButton(page).click()
  await expect(searchInput(page)).toBeFocused()
  await expect(option(page, /^New book…/)).toBeVisible()
  await expect(option(page, /^Write$/)).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(searchButton(page)).toBeFocused()

  await pick(page, "point of view", /^Point of view.*Glossary$/)
  const glossary = page.getByRole("dialog", { name: "Glossary" })
  await expect(glossary.getByRole("article", { name: "Point of view", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(glossary).toBeHidden()

  await pick(page, "salt", /^The Salt Ledger/)
  await expect(page).toHaveURL(/\/b\/[^/]+\/write/)
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toBeVisible()
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("the Search button opens it, and a tap goes to a chapter", async ({ page }) => {
    await openFirstChapter(page)
    await searchButton(page).tap()
    await expect(searchInput(page)).toBeFocused()
    await searchInput(page).fill("keeper")
    await option(page, /^2\. The Keeper's Room/).tap()
    await expect(palette(page)).toBeHidden()
    await expect(page.getByRole("heading", { name: "The Keeper's Room" })).toBeFocused()
  })
})
