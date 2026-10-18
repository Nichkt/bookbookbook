import type { Page } from "@playwright/test"
import { expect, openFirstChapter, queryDb, test } from "./fixtures"

const ACT_I = "ACT I — Arrival"
const ACT_II = "ACT II — The Ledger"

/** Opens the sample book's plan from the header, on the Board unless asked for the Outline. */
async function openPlan(page: Page, view: "Board" | "Outline" = "Board") {
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Plan" }).click()
  if (view === "Outline") {
    await page.getByRole("navigation", { name: "Plan views" }).getByRole("link", { name: "Outline" }).click()
  }
  await expect(page.getByRole("heading", { level: 1, name: `Plan: ${view}` })).toBeAttached()
}

/** An act's cards on the Board, by their "Chapter N: Title" buttons. */
const boardCards = (page: Page, act: string) =>
  page.getByRole("list", { name: act, exact: true }).getByRole("button", { name: /^Chapter \d+: / })

/** The card itself, which is what you drag. */
const card = (page: Page, title: string) =>
  page
    .locator("li[data-chapter-card]")
    .filter({ has: page.getByRole("button", { name: new RegExp(`^Chapter \\d+: ${title}$`) }) })

/** An act's chapters in the Outline, by their title fields. */
const outlineChapters = (page: Page, act: string) =>
  page.getByRole("list", { name: `Chapters in ${act}` }).getByRole("textbox", { name: /^Title of chapter \d+$/ })

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })

/** The polite live region behind `announce()`; dnd-kit keeps its own. */
const announcer = (page: Page) => page.locator('div.sr-only[role="status"]')

const DIMMED = /(^|\s)opacity-30(\s|$)/

test.describe("Board", () => {
  test("drags a card into the next act, and it stays there after a reload", async ({ page }) => {
    // Tall enough for both acts, so the drag doesn't scroll the page.
    await page.setViewportSize({ width: 1280, height: 1100 })
    await openPlan(page)
    const from = await card(page, "Low Tide").boundingBox()
    const to = await card(page, "The Archive").boundingBox()
    if (!from || !to) throw new Error("The cards aren't laid out.")

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2 + 20, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
    await page.mouse.up()

    await expect(announcer(page)).toHaveText(/^Moved to position \d of 6 in “ACT II — The Ledger”$/)
    await expect(boardCards(page, ACT_I)).toHaveCount(3)
    await expect(boardCards(page, ACT_II).filter({ hasText: "Low Tide" })).toHaveCount(1)
    // The drop isn't also a click that opens the drawer.
    await expect(page).not.toHaveURL(/chapter=/)

    await page.reload()
    await expect(boardCards(page, ACT_II)).toHaveCount(6)
    await expect(boardCards(page, ACT_II).filter({ hasText: "Low Tide" })).toHaveCount(1)
  })

  test("Alt+arrows move a card and say where it went", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Chapter 1: The Ferry Home" }).focus()

    await page.keyboard.press("Alt+ArrowRight")
    await expect(announcer(page)).toHaveText("Moved to position 2 of 4 in “ACT I — Arrival”")
    await expect(page.getByRole("button", { name: "Chapter 2: The Ferry Home" })).toBeFocused()

    await page.keyboard.press("Alt+ArrowDown")
    await expect(announcer(page)).toHaveText("Moved to position 1 of 6 in “ACT II — The Ledger”")
    await expect(page.getByRole("button", { name: "Chapter 4: The Ferry Home" })).toBeFocused()
    await expect(boardCards(page, ACT_II).first()).toHaveAccessibleName("Chapter 4: The Ferry Home")

    // Alt+← is also the browser's Back; on a card it only moves the card.
    await page.keyboard.press("Alt+ArrowLeft")
    await expect(announcer(page)).toHaveText("Already the first chapter of this act.")
    await expect(page).toHaveURL(/\/plan\/board$/)
  })

  test("remembers the display preset for each view", async ({ page }) => {
    await openPlan(page)
    const summary = page.getByText("Mara Quill returns to Grayhaven")
    await expect(summary).toBeVisible()

    await page.getByRole("button", { name: "Display options" }).click()
    await page.getByRole("menuitemradio", { name: "Compact" }).click()
    await expect(summary).toBeHidden()
    await expect
      .poll(() => queryDb(page, "SELECT value FROM ui_prefs WHERE id LIKE 'plan.display:%:board'"))
      .toEqual([{ value: '{"preset":"compact"}' }])

    await page.reload()
    await expect(page.getByRole("button", { name: "Chapter 1: The Ferry Home" })).toBeVisible()
    await expect(summary).toBeHidden()
    await page.getByRole("button", { name: "Display options" }).click()
    await expect(page.getByRole("menuitemradio", { name: "Compact" })).toBeChecked()
    await page.keyboard.press("Escape")

    await page.getByRole("navigation", { name: "Plan views" }).getByRole("link", { name: "Outline" }).click()
    await page.getByRole("button", { name: "Display options" }).click()
    await expect(page.getByRole("menuitemradio", { name: "Detailed" })).toBeChecked()
  })

  test("filters dim the chapters that don't match, and live in the URL", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Filter", exact: true }).click()
    const popover = page.getByRole("dialog").filter({ hasText: "Filter chapters" })
    await popover.getByRole("combobox", { name: "Status" }).click()
    await page.getByRole("option", { name: "Outlined" }).click()
    await expect(popover.getByText("4 of 12 chapters match")).toBeVisible()
    await expect(page).toHaveURL(/[?&]status=outlined/)
    await page.keyboard.press("Escape")

    await expect(card(page, "The Ferry Home")).toHaveClass(DIMMED)
    await expect(card(page, "The Archive")).not.toHaveClass(DIMMED)

    await page.reload()
    await expect(card(page, "The Ferry Home")).toHaveClass(DIMMED)
    await page.getByRole("button", { name: "Filter, 1 on" }).click()
    await popover.getByRole("button", { name: "Clear" }).click()
    await expect(popover.getByText("12 chapters", { exact: true })).toBeVisible()
    await expect(page).not.toHaveURL(/status=/)
    await expect(card(page, "The Ferry Home")).not.toHaveClass(DIMMED)
  })
})

test.describe("Chapter pop-out", () => {
  test("saves what you change, and opens again from the URL after a reload", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Chapter 5: The Archive" }).click()
    await expect(page).toHaveURL(/\?chapter=/)
    const popout = page.getByRole("dialog", { name: /^Chapter 5: / })
    await expect(popout.getByRole("heading", { name: "Chapter 5", exact: true })).toBeVisible()

    const summary = "Mara reads the harbor records by lamplight."
    await popout.getByRole("textbox", { name: "Chapter title" }).fill("The Records Room")
    await popout.getByRole("combobox", { name: "Status" }).click()
    await page.getByRole("option", { name: "Drafting" }).click()
    await popout.getByRole("textbox", { name: "Summary" }).fill(summary)

    // The card follows along, which also means it's saved. The pop-out hides the page from the accessibility tree.
    const updated = page.locator("li[data-chapter-card]").filter({ hasText: "The Records Room" })
    await expect(updated).toContainText(summary)
    await expect(updated).toContainText("Drafting")

    await page.reload()
    await expect(popout).toHaveAccessibleName("Chapter 5: The Records Room")
    await expect(popout.getByRole("heading", { name: "Chapter 5", exact: true })).toBeFocused()
    await expect(popout.getByRole("textbox", { name: "Chapter title" })).toHaveValue("The Records Room")
    await expect(popout.getByRole("combobox", { name: "Status" })).toHaveText("Drafting")
    await expect(popout.getByRole("textbox", { name: "Summary" })).toHaveValue(summary)
  })

  test("steps through the chapters, and Write this chapter opens one in Write", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Chapter 2: The Keeper's Room" }).click()
    const popout = page.getByRole("dialog", { name: /^Chapter \d+: / })
    await expect(popout).toHaveAccessibleName("Chapter 2: The Keeper's Room")
    await expect(popout.getByRole("textbox", { name: "Word count target" })).toBeVisible()
    await expect(popout.getByText("Point of view", { exact: true })).toBeVisible()
    await expect(popout.getByText("What characters are present", { exact: true })).toBeVisible()
    await expect(popout.getByText("Story points", { exact: true })).toBeVisible()

    await popout.getByRole("button", { name: "Next chapter" }).click()
    await expect(popout).toHaveAccessibleName("Chapter 3: The Drowned Bell")
    await popout.getByRole("button", { name: "Previous chapter" }).click()
    await expect(popout).toHaveAccessibleName("Chapter 2: The Keeper's Room")
    await popout.getByRole("button", { name: "Next chapter" }).click()
    await expect(popout).toHaveAccessibleName("Chapter 3: The Drowned Bell")

    // Escape puts focus back on the card of the chapter it was showing.
    await page.keyboard.press("Escape")
    await expect(popout).toBeHidden()
    await expect(page.getByRole("button", { name: "Chapter 3: The Drowned Bell" })).toBeFocused()
    await expect(page).not.toHaveURL(/chapter=/)

    await page.getByRole("button", { name: "Chapter 3: The Drowned Bell" }).click()
    await popout.getByRole("link", { name: "Write this chapter" }).click()
    await expect(page).toHaveURL(/\/write\/[^/?]+$/)
    await expect(page.getByRole("heading", { level: 1, name: "The Drowned Bell" })).toBeFocused()
  })

  test("pops out from the Outline too, and gives focus back to the chapter's line", async ({ page }) => {
    await openPlan(page, "Outline")
    await page.getByRole("button", { name: "Open details for chapter 4" }).click()
    const popout = page.getByRole("dialog", { name: "Chapter 4: Low Tide" })
    await expect(popout.getByRole("heading", { name: "Chapter 4", exact: true })).toBeFocused()
    await popout.getByRole("button", { name: "Close details" }).click()
    await expect(popout).toBeHidden()
    await expect(page.getByRole("textbox", { name: "Title of chapter 4" })).toBeFocused()
  })

  test("a chapter moved to the Trash comes back from the book menu", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Chapter 6: Storm Warning" }).click()
    const popout = page.getByRole("dialog", { name: "Chapter 6: Storm Warning" })
    await popout.getByRole("button", { name: "More for this chapter" }).click()
    await page.getByRole("menuitem", { name: "Move to Trash" }).click()

    await expect(popout).toBeHidden()
    await expect(toast(page, "Moved “Storm Warning” to the Trash")).toBeVisible()
    await expect(boardCards(page, ACT_II)).toHaveCount(4)
    await expect(page.getByRole("button", { name: /Storm Warning/ })).toHaveCount(0)

    await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
    await page.getByRole("menuitem", { name: "Trash…" }).click()
    const trash = page.getByRole("dialog", { name: "Trash" })
    await trash.getByRole("button", { name: "Restore Storm Warning" }).click()
    await expect(toast(page, "Restored “Storm Warning”")).toBeVisible()
    await expect(trash.getByText("The Trash is empty.")).toBeVisible()
    await page.keyboard.press("Escape")

    await expect(boardCards(page, ACT_II)).toHaveCount(5)
    await expect(page.getByRole("button", { name: "Chapter 6: Storm Warning" })).toBeVisible()
  })

  test("deleting a moment offers Undo, which brings it back without closing the pop-out", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Chapter 1: The Ferry Home" }).click()
    const popout = page.getByRole("dialog", { name: "Chapter 1: The Ferry Home" })
    const moment2 = popout.getByRole("textbox", { name: "Moment 2", exact: true })
    await expect(moment2).toHaveValue("Jonas dodges the Harbor Guild")

    await popout.getByRole("button", { name: "Delete moment 2" }).click()
    const deleted = toast(page, "Deleted “Jonas dodges the Harbor Guild”")
    await expect(deleted).toBeVisible()
    await expect(moment2).toHaveValue("Elias offers help she refuses")
    await expect(moment2).toBeFocused()

    await deleted.getByRole("button", { name: "Undo" }).click()
    await expect(popout).toBeVisible()
    await expect(moment2).toHaveValue("Jonas dodges the Harbor Guild")
    await expect(moment2).toBeFocused()
    await expect(popout.getByRole("textbox", { name: "Moment 3", exact: true })).toHaveValue(
      "Elias offers help she refuses",
    )
  })
})

test.describe("Outline", () => {
  test("Tab folds a chapter into the one above, and Undo puts it back", async ({ page }) => {
    await openPlan(page, "Outline")
    const lowTide = page.getByRole("textbox", { name: "Title of chapter 4" })
    await expect(lowTide).toHaveValue("Low Tide")
    await lowTide.click()
    await page.keyboard.press("Tab")

    const folded = toast(page, "Folded “Low Tide” into “The Drowned Bell” as a scene")
    await expect(folded).toBeVisible()
    await expect(outlineChapters(page, ACT_I)).toHaveCount(3)
    const scene = page.getByRole("textbox", { name: "Title of scene 3 in chapter 3" })
    await expect(scene).toHaveValue("Mud and rope")
    await expect(scene).toBeFocused()

    await folded.getByRole("button", { name: "Undo" }).click()
    await expect(outlineChapters(page, ACT_I)).toHaveCount(4)
    await expect(page.getByRole("textbox", { name: "Title of chapter 4" })).toHaveValue("Low Tide")
    await expect(page.getByRole("textbox", { name: "Title of chapter 4" })).toBeFocused()
    await expect(page.getByRole("list", { name: "Scenes in chapter 3" }).getByRole("textbox")).toHaveCount(2)
  })

  test("Shift+Tab on a scene splits it off into a new chapter, and Undo joins it back", async ({ page }) => {
    await openPlan(page, "Outline")
    const scene = page.getByRole("textbox", { name: "Title of scene 2 in chapter 2" })
    await expect(scene).toHaveValue("A key in the spine")
    await scene.click()
    await page.keyboard.press("Shift+Tab")

    const split = toast(page, "Split “A key in the spine” off into a new chapter")
    await expect(split).toBeVisible()
    await expect(outlineChapters(page, ACT_I)).toHaveCount(5)
    const chapter = page.getByRole("textbox", { name: "Title of chapter 3" })
    await expect(chapter).toHaveValue("A key in the spine")
    await expect(chapter).toBeFocused()

    await split.getByRole("button", { name: "Undo" }).click()
    await expect(outlineChapters(page, ACT_I)).toHaveCount(4)
    await expect(page.getByRole("textbox", { name: "Title of chapter 3" })).toHaveValue("The Drowned Bell")
    await expect(page.getByRole("list", { name: "Scenes in chapter 2" }).getByRole("textbox")).toHaveCount(2)
  })
})

test.describe("Between Plan and Write", () => {
  test("a chapter's Plan link opens its details, and Back returns to writing", async ({ page }) => {
    await openFirstChapter(page)
    const writeUrl = page.url()
    await page.getByRole("link", { name: "Plan chapter 1" }).click()
    await expect(page).toHaveURL(/\/plan\/board\?chapter=/)
    const popout = page.getByRole("dialog", { name: "Chapter 1: The Ferry Home" })
    await expect(popout.getByRole("textbox", { name: "Chapter title" })).toHaveValue("The Ferry Home")

    // Opened by a link, the pop-out closes in place rather than going back.
    await popout.getByRole("button", { name: "Close details" }).click()
    await expect(popout).toBeHidden()
    await expect(page).toHaveURL(/\/plan\/board$/)

    await page.goBack()
    await expect(page).toHaveURL(writeUrl)
    await expect(page.getByRole("textbox", { name: "Ferry wake" })).toBeVisible()
  })

  test("a new book opens on its plan, and an empty one offers to start writing", async ({ page }) => {
    await openFirstChapter(page)
    await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
    await page.getByRole("menuitem", { name: "New book…" }).click()
    const dialog = page.getByRole("dialog", { name: "New book" })
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Harbor Lights")
    await dialog.getByRole("button", { name: "Create book" }).click()

    await expect(page).toHaveURL(/\/plan\/board$/)
    await expect(page.getByRole("button", { name: "Book: Harbor Lights" })).toBeVisible()
    await expect(page.getByRole("button", { name: /^Chapter \d+: / })).toHaveCount(1)

    await page.getByRole("button", { name: "Chapter 1: Untitled chapter" }).click()
    await page.getByRole("button", { name: "More for this chapter" }).click()
    await page.getByRole("menuitem", { name: "Move to Trash" }).click()
    await expect(page.getByRole("button", { name: /^Chapter \d+: / })).toHaveCount(0)

    await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Write" }).click()
    await expect(page.getByRole("heading", { name: "No chapters yet" })).toBeVisible()
    await page.getByRole("button", { name: "Write chapter 1" }).click()
    const text = page.getByRole("textbox", { name: "Chapter text" })
    await expect(text).toBeFocused()
    await page.keyboard.type("The harbor lights came on one by one.")
    await expect(text).toHaveText("The harbor lights came on one by one.")
  })
})

test.describe("on a phone-sized screen", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

  test("stacks full-width cards and opens details in a sheet that Back closes", async ({ page }) => {
    await openPlan(page)
    const cards = page.locator("li[data-chapter-card]")
    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()
    if (!first || !second) throw new Error("The cards aren't laid out.")
    expect(first.width).toBeGreaterThan(360)
    expect(second.y).toBeGreaterThan(first.y + first.height)

    await page.getByRole("button", { name: "Chapter 2: The Keeper's Room" }).tap()
    const sheet = page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole("textbox", { name: "Chapter title" })).toHaveValue("The Keeper's Room")
    expect((await sheet.boundingBox())?.width).toBe(412)

    await page.goBack()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/\/plan\/board$/)
    await expect(page.getByRole("button", { name: "Chapter 2: The Keeper's Room" })).toBeFocused()
  })
})
