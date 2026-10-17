import type { Locator, Page } from "@playwright/test"
import { expect, flushAll, focusEnd, openFirstChapter, test } from "./fixtures"

const codexButton = (page: Page) => page.getByRole("button", { name: "Codex", exact: true })
const codexPanel = (page: Page) => page.getByRole("complementary", { name: "Codex" })
const chapterRows = (panel: Locator) => panel.getByRole("region", { name: "In this chapter" }).getByRole("button")
const codexEntryHeading = (page: Page, name: string) =>
  page.locator("[data-codex-entry]").getByRole("heading", { name })
const scrollTop = (panel: Locator) => panel.evaluate((element) => element.scrollTop)
/** Scrolls the panel until the row sits just under its header, out of the way of the rows above. */
const scrollToRow = (row: Locator) =>
  row.evaluate((element) => {
    const scroller = element.closest("[data-write-panel-scroller]")
    if (!scroller) throw new Error("The row isn't in the panel")
    scroller.scrollTop += element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 64
  })

test.describe("the Codex panel", () => {
  test("lists what the chapter names first, and reads one entry at a time", async ({ page }) => {
    await openFirstChapter(page)
    await codexButton(page).click()
    const panel = codexPanel(page)
    await expect(panel.getByRole("heading", { level: 2, name: "Codex" })).toBeFocused()
    await expect(codexButton(page)).toHaveAttribute("aria-expanded", "true")

    // The POV, then the location, then by mentions. The plan's threads aren't named in the text.
    const rows = chapterRows(panel)
    await expect(rows).toHaveCount(9)
    await expect(rows.nth(0)).toHaveAccessibleName("Mara Quill POV · Present · 4 mentions")
    await expect(rows.nth(1)).toHaveAccessibleName("North Quay Location · 2 mentions")
    await expect(rows.nth(2)).toHaveAccessibleName("Jonas Quill Present · 2 mentions")
    await expect(rows.nth(5)).toHaveAccessibleName("Elias Penhallow Present · 1 mention")
    await expect(rows.nth(8)).toHaveAccessibleName("Ledger mystery Thread")

    await rows.nth(2).click()
    await expect(panel.getByRole("heading", { level: 2, name: "Jonas Quill" })).toBeFocused()
    await expect(panel).toContainText("In this chapter: Present · 2 mentions")
    await expect(panel).toContainText("Fisherman and Mara's brother")
    await panel.getByRole("button", { name: "Back" }).click()
    await expect(rows.nth(2)).toBeFocused()

    const search = panel.getByRole("searchbox", { name: "Search the codex" })
    await search.fill("brass")
    const results = panel.getByRole("list", { name: "Search results" }).getByRole("button")
    await expect(results.first()).toHaveAccessibleName("the Brass Key Object · brass key")
    await expect(panel.getByRole("status")).toHaveText(/^\d+ entr(y|ies) found$/)
    await search.fill("nothing by that name")
    await panel.getByRole("button", { name: "Clear search" }).click()
    await expect(search).toHaveValue("")
    await expect(search).toBeFocused()

    await rows.nth(0).click()
    await panel.getByRole("link", { name: "Open in Codex" }).click()
    await expect(page).toHaveURL(/\/codex\/[^/]+$/)
    await expect(codexEntryHeading(page, "Character: Mara Quill")).toBeVisible()
  })

  test("goes back to the list where it was left, on the entry's row", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await codexButton(page).click()
    const panel = codexPanel(page)
    await expect(chapterRows(panel)).toHaveCount(9)

    // Jonas has a row in this chapter and another with the characters: Back goes to the one he was opened from.
    const characters = panel.getByRole("region", { name: "Characters" })
    const jonas = characters.getByRole("button", { name: /^Jonas Quill/ })
    await scrollToRow(jonas)
    const left = await scrollTop(panel)
    expect(left).toBeGreaterThan(0)
    await jonas.click()
    await expect(panel.getByRole("heading", { level: 2, name: "Jonas Quill" })).toBeFocused()
    await panel.getByRole("button", { name: "Back" }).click()
    await expect(jonas).toBeFocused()
    expect(await scrollTop(panel)).toBe(left)

    // Details opens an entry over the list as it was scrolled since, and Back lands on the entry's row in view.
    const mara = characters.getByRole("button", { name: /^Mara Quill/ })
    await scrollToRow(mara)
    const scrolled = await scrollTop(panel)
    expect(scrolled).not.toBe(left)
    await editor.locator(".mention-auto", { hasText: "Mara Quill" }).hover()
    await page.getByRole("dialog", { name: "Mara Quill" }).getByRole("button", { name: "Details" }).click()
    await expect(panel.getByRole("heading", { level: 2, name: "Mara Quill" })).toBeVisible()
    await panel.getByRole("button", { name: "Back" }).click()
    await expect(mara).toBeFocused()
    expect(await scrollTop(panel)).toBe(scrolled)
  })

  test("counts names as they're written, and shares the panel with the chapter plan", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await codexButton(page).click()
    const panel = codexPanel(page)
    const rows = chapterRows(panel)
    await expect(rows.nth(0)).toHaveAccessibleName("Mara Quill POV · Present · 4 mentions")
    const agnes = rows.filter({ hasText: "Agnes Morrow" })
    await expect(agnes).toHaveCount(0)

    await focusEnd(editor)
    await page.keyboard.type(" Agnes Morrow waved from the quay.")
    await expect(agnes).toHaveAccessibleName("Agnes Morrow 1 mention")
    await expect(rows.nth(1)).toHaveAccessibleName("North Quay Location · 3 mentions")

    // It stays open across visits on a wide screen, and counts what was saved.
    await flushAll(page)
    await page.reload()
    await expect(agnes).toHaveAccessibleName("Agnes Morrow 1 mention")

    // One page at a time, and each button closes its own.
    await page.getByRole("button", { name: "Chapter plan" }).click()
    await expect(page.getByRole("complementary", { name: "Chapter details" })).toBeVisible()
    await expect(panel).toHaveCount(0)
    await codexButton(page).click()
    await expect(panel).toBeVisible()
    await expect(page.getByRole("complementary", { name: "Chapter details" })).toHaveCount(0)
    await codexButton(page).click()
    await expect(panel).toHaveCount(0)
    await expect(codexButton(page)).toHaveAttribute("aria-expanded", "false")
  })
})

test.describe("a name in the text", () => {
  test("shows its card on hover, without taking the caret", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    const mara = editor.locator(".mention-auto", { hasText: "Mara Quill" })
    const card = page.getByRole("dialog", { name: "Mara Quill" })
    await mara.hover()
    await expect(card).toBeVisible()
    await expect(card).toContainText("Cartographer returning home")
    await expect(editor).toBeFocused()

    // Typing puts it away, and keeps it away for a moment.
    await page.keyboard.press("ArrowLeft")
    await expect(card).toHaveCount(0)
    await expect(async () => {
      await page.mouse.move(0, 0)
      await mara.hover()
      await expect(card).toBeVisible({ timeout: 1000 })
    }).toPass()

    // Details opens the entry beside the text. The caret stays put, and closing the panel goes back to it.
    await card.getByRole("button", { name: "Details" }).click()
    await expect(card).toHaveCount(0)
    const panel = codexPanel(page)
    await expect(panel.getByRole("heading", { level: 2, name: "Mara Quill" })).toBeVisible()
    await expect(editor).toBeFocused()
    await panel.getByRole("button", { name: "Close panel" }).click()
    await expect(panel).toHaveCount(0)
    await expect(editor).toBeFocused()
  })

  test("places the caret on a click, and opens in the Codex on Ctrl+click", async ({ page }) => {
    const editor = await openFirstChapter(page)
    const grayhaven = editor.locator(".mention-auto").first()
    await expect(grayhaven).toHaveText("Grayhaven")
    await grayhaven.click()
    await expect(editor).toBeFocused()
    await expect(page).toHaveURL(/\/write\/[^/]+$/)

    await grayhaven.click({ modifiers: ["ControlOrMeta"] })
    await expect(page).toHaveURL(/\/codex\/[^/]+$/)
    await expect(codexEntryHeading(page, "Location: Grayhaven")).toBeVisible()
  })
})
