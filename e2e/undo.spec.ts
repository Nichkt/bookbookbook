import type { Page } from "@playwright/test"
import { expect, focusEnd, openFirstChapter, queryDb, test } from "./fixtures"

const header = (page: Page) => page.getByRole("banner")
const undoButton = (page: Page) => header(page).getByRole("button", { name: "Undo", exact: true })
const redoButton = (page: Page) => header(page).getByRole("button", { name: "Redo", exact: true })

/** The header's word on saving, found by its data, as a pop-out hides the page from the accessibility tree. */
const saveStatus = (page: Page) => page.locator("[data-save-status]")

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })

/** The polite live region behind `announce()`. */
const announcer = (page: Page) => page.locator('div.sr-only[role="status"][aria-live="polite"]')

const screens = (page: Page) => page.getByRole("navigation", { name: "Screens" })

/** Opens the sample book's plan from the header, on the Board unless asked for the Outline. */
async function openPlan(page: Page, view: "Board" | "Outline" = "Board") {
  await openFirstChapter(page)
  await screens(page).getByRole("link", { name: "Plan" }).click()
  if (view === "Outline") {
    await page.getByRole("navigation", { name: "Plan views" }).getByRole("link", { name: "Outline" }).click()
  }
  await expect(page.getByRole("heading", { level: 1, name: `Plan: ${view}` })).toBeAttached()
}

const ARCHIVE_SUMMARY = "Mara and Elias search the Archive and learn the Night Ferry passenger list was altered."
const LAMPLIGHT = "Mara reads the records by lamplight."

/** The Archive, chapter 5 of the sample book, as it's saved: it starts out outlined, with ARCHIVE_SUMMARY. */
async function archive(page: Page) {
  const [row] = await queryDb<{ status: string; summary: string }>(
    page,
    "SELECT status, summary FROM chapters WHERE title = 'The Archive'",
  )
  return row
}

/** Keeps the app's writes waiting, as a busy disk might, until the function it returns lets them go. */
async function holdWrites(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((held) => {
        void window.__bbb.db.writeLock(() => {
          held()
          return new Promise<void>((resolve) => Object.assign(window, { __letGo: resolve }))
        })
      }),
  )
  return () => page.evaluate(() => (window as unknown as { __letGo: () => void }).__letGo())
}

/** Notes, for each Ctrl+Z from here on, whether the app took it, which stops the browser's own. */
async function watchCtrlZ(page: Page) {
  await page.evaluate(() => {
    const taken: boolean[] = []
    window.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === "z") taken.push(event.defaultPrevented)
    })
    Object.assign(window, { __ctrlZ: taken })
  })
  return () => page.evaluate(() => (window as unknown as { __ctrlZ: boolean[] }).__ctrlZ.splice(0))
}

test("Undo and Redo in the header take back the latest change and bring it back", async ({ page }) => {
  await openPlan(page)
  await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(undoButton(page)).toHaveAttribute("title", "Nothing to undo")

  await page.getByRole("button", { name: "Chapter 5: The Archive" }).click()
  const popout = page.getByRole("dialog", { name: "Chapter 5: The Archive" })
  await popout.getByRole("textbox", { name: "Chapter title" }).fill("The Records Room")
  await popout.getByRole("button", { name: "Close details" }).click()
  const renamed = page.getByRole("button", { name: "Chapter 5: The Records Room" })
  await expect(renamed).toBeVisible()
  await expect(undoButton(page)).toHaveAttribute("title", "Undo: Renamed “The Archive” · Ctrl+Z")

  await undoButton(page).click()
  await expect(page.getByRole("button", { name: "Chapter 5: The Archive" })).toBeVisible()
  await expect(toast(page, "Undone: Renamed “The Archive”")).toBeVisible()
  await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(redoButton(page)).toHaveAttribute("title", "Redo: Renamed “The Archive” · Ctrl+Y")

  await redoButton(page).click()
  await expect(renamed).toBeVisible()
  await expect(toast(page, "Redone: Renamed “The Archive”")).toBeVisible()
  await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false")

  // Every change is saved as it's made. What Undo can take back lasts until the app closes.
  await page.reload()
  await expect(renamed).toBeVisible()
  await expect(undoButton(page)).toHaveAttribute("title", "Nothing to undo")
})

test("Ctrl+Z and Ctrl+Y undo and redo, but in text Ctrl+Z is the text's own", async ({ page }) => {
  await openPlan(page, "Outline")
  await page.getByRole("button", { name: "Open details for chapter 5" }).click()
  const popout = page.getByRole("dialog", { name: "Chapter 5: The Archive" })
  await popout.getByRole("combobox", { name: "Status" }).click()
  await page.getByRole("option", { name: "Drafting" }).click()
  await popout.getByRole("textbox", { name: "Summary" }).fill(LAMPLIGHT)
  await popout.getByRole("button", { name: "Close details" }).click()
  await expect.poll(() => archive(page)).toMatchObject({ status: "drafting", summary: LAMPLIGHT })

  // In a field, Ctrl+Z takes back what was typed there, as it always does.
  const title = page.getByRole("textbox", { name: "Title of chapter 5" })
  await expect(title).toBeFocused()
  const ctrlZ = await watchCtrlZ(page)
  await page.keyboard.press("End")
  await page.keyboard.type(" Wing")
  await expect(title).toHaveValue("The Archive Wing")
  await page.keyboard.press("Control+z")
  await expect(title).toHaveValue("The Archive")
  expect(await ctrlZ()).toEqual([false])

  // Anywhere else, it takes back the book's latest change, and Ctrl+Y or Ctrl+Shift+Z brings it back.
  await page.getByRole("button", { name: "Open details for chapter 5" }).focus()
  await page.keyboard.press("Control+z")
  await expect(toast(page, "Undone: Changed the summary of “The Archive”")).toBeVisible()
  await expect.poll(() => archive(page)).toMatchObject({ status: "drafting", summary: ARCHIVE_SUMMARY })
  expect(await ctrlZ()).toEqual([true])

  await page.keyboard.press("Control+z")
  await expect(toast(page, "Undone: Changed the status of “The Archive”")).toBeVisible()
  await expect.poll(() => archive(page)).toMatchObject({ status: "outlined", summary: ARCHIVE_SUMMARY })

  await page.keyboard.press("Control+y")
  await expect(toast(page, "Redone: Changed the status of “The Archive”")).toBeVisible()
  await expect.poll(() => archive(page)).toMatchObject({ status: "drafting", summary: ARCHIVE_SUMMARY })
  await page.keyboard.press("Control+Shift+z")
  await expect(toast(page, "Redone: Changed the summary of “The Archive”")).toBeVisible()
  await expect.poll(() => archive(page)).toMatchObject({ status: "drafting", summary: LAMPLIGHT })
  await expect(page.getByRole("button", { name: "Open details for chapter 5" })).toBeFocused()
})

test("typing in a field is one step to undo, pauses and all", async ({ page }) => {
  await openPlan(page, "Outline")
  const title = page.getByRole("textbox", { name: "Title of chapter 4" })
  await expect(title).toHaveValue("Low Tide")
  const saved = async () =>
    (await queryDb<{ title: string }>(page, "SELECT title FROM chapters WHERE title LIKE 'Low Tide%'"))[0]?.title

  await title.click()
  await page.keyboard.press("End")
  await page.keyboard.type(" at")
  await expect.poll(saved).toBe("Low Tide at")
  await page.keyboard.type(" Dawn")
  await expect.poll(saved).toBe("Low Tide at Dawn")

  await expect(undoButton(page)).toHaveAttribute("title", "Undo: Renamed “Low Tide” · Ctrl+Z")
  await undoButton(page).click()
  await expect(title).toHaveValue("Low Tide")
  await expect.poll(saved).toBe("Low Tide")
  await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true")
})

test("Undo takes back the latest change wherever it was made", async ({ page }) => {
  await openFirstChapter(page)
  await screens(page).getByRole("link", { name: "World" }).click()
  const name = page.getByRole("textbox", { name: "Name" })
  await expect(name).toHaveValue("Agnes Morrow")
  await name.fill("Agnes Marrow")
  await name.press("Tab")

  await screens(page).getByRole("link", { name: "Plan" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Plan: Board" })).toBeAttached()
  await expect(undoButton(page)).toHaveAttribute("title", "Undo: Renamed “Agnes Morrow” · Ctrl+Z")
  await undoButton(page).click()
  await expect(toast(page, "Undone: Renamed “Agnes Morrow”")).toBeVisible()

  await screens(page).getByRole("link", { name: "World" }).click()
  await expect(name).toHaveValue("Agnes Morrow")
})

test("a chapter moved to the Trash comes back with Undo, and Redo in its toast moves it again", async ({ page }) => {
  await openPlan(page)
  await page.getByRole("button", { name: "Chapter 6: Storm Warning" }).click()
  const popout = page.getByRole("dialog", { name: "Chapter 6: Storm Warning" })
  await popout.getByRole("button", { name: "More for this chapter" }).click()
  await page.getByRole("menuitem", { name: "Move to Trash" }).click()
  await expect(toast(page, "Moved “Storm Warning” to the Trash")).toBeVisible()
  await expect(page.getByRole("button", { name: /Storm Warning/ })).toHaveCount(0)

  // The header's Undo does what the toast's would.
  await undoButton(page).click()
  await expect(page.getByRole("button", { name: "Chapter 6: Storm Warning" })).toBeVisible()
  const undone = toast(page, "Undone: Moved “Storm Warning” to the Trash")
  await expect(undone).toBeVisible()
  await expect(toast(page, "Moved “Storm Warning” to the Trash").filter({ hasNotText: "Undone" })).toHaveCount(0)

  await undone.getByRole("button", { name: "Redo" }).click()
  await expect(page.getByRole("button", { name: /Storm Warning/ })).toHaveCount(0)
  const redone = toast(page, "Redone: Moved “Storm Warning” to the Trash")
  await expect(redone).toBeVisible()
  // The toast is put up again in place, and stays rather than going with the one clicked.
  await page.waitForTimeout(500)
  await expect(redone).toBeVisible()
  await redone.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByRole("button", { name: "Chapter 6: Storm Warning" })).toBeVisible()
  await expect(toast(page, "Undone: Moved “Storm Warning” to the Trash")).toBeVisible()
})

test("Undo in the header takes back typing in a scene, with the caret staying in the text", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  await page.keyboard.insertText(" The gulls followed her home.")
  await expect(editor).toContainText("The gulls followed her home.")
  await expect(undoButton(page)).toHaveAttribute("title", "Undo: Typing in “Ferry wake” · Ctrl+Z")

  await undoButton(page).click()
  await expect(editor).not.toContainText("The gulls followed her home.")
  await expect(editor).toBeFocused()
  await expect(announcer(page)).toHaveText("Undone: Typing in “Ferry wake”")

  await redoButton(page).click()
  await expect(editor).toContainText("The gulls followed her home.")
  await expect(editor).toBeFocused()
  await expect(announcer(page)).toHaveText("Redone: Typing in “Ferry wake”")
})

test("Search has Undo and Redo, saying what they'd do", async ({ page }) => {
  await openPlan(page)
  await page.getByRole("button", { name: "Chapter 5: The Archive" }).click()
  const popout = page.getByRole("dialog", { name: "Chapter 5: The Archive" })
  await popout.getByRole("combobox", { name: "Status" }).click()
  await page.getByRole("option", { name: "Drafting" }).click()
  await popout.getByRole("button", { name: "Close details" }).click()
  await expect(popout).toBeHidden()
  await expect.poll(() => archive(page)).toMatchObject({ status: "drafting" })

  const palette = page.getByRole("dialog", { name: "Search" })
  const search = palette.getByRole("combobox", { name: "Search" })
  await page.keyboard.press("Control+k")
  await expect(search).toBeFocused()
  await page.keyboard.type("undo")
  // Not the glossary's "Undo and Redo", which Search finds too.
  const undo = palette.getByRole("option", { name: /^Undo Changed/ })
  await expect(undo).toContainText("Changed the status of “The Archive”")
  await expect(undo).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")
  await expect(palette).toBeHidden()
  await expect.poll(() => archive(page)).toMatchObject({ status: "outlined" })

  await page.keyboard.press("Control+k")
  await expect(search).toBeFocused()
  await page.keyboard.type("redo")
  const redo = palette.getByRole("option", { name: /^Redo Changed/ })
  await expect(redo).toContainText("Changed the status of “The Archive”")
  await page.keyboard.press("Enter")
  await expect.poll(() => archive(page)).toMatchObject({ status: "drafting" })
})

test("the header says the work is saved, and closing the tab before it is asks first", async ({ page }) => {
  await openPlan(page)
  const status = saveStatus(page)
  await expect(status).toHaveAttribute("data-save-status", "saved")
  await expect(status).toHaveAccessibleName("Saved")
  await status.click()
  const about = page.getByRole("dialog", { name: "All saved" })
  await expect(about).toHaveAccessibleDescription(/^bookbookbook saves your work by itself as you go, in this browser/)
  await page.keyboard.press("Escape")
  await expect(about).toBeHidden()

  await page.getByRole("button", { name: "Chapter 5: The Archive" }).click()
  const popout = page.getByRole("dialog", { name: "Chapter 5: The Archive" })
  const letGo = await holdWrites(page)
  await popout.getByRole("textbox", { name: "Summary" }).fill(LAMPLIGHT)
  await expect(status).toHaveAttribute("data-save-status", "saving")
  await expect(status).toHaveText("Saving…")

  const asked = page.waitForEvent("dialog")
  await page.close({ runBeforeUnload: true })
  const dialog = await asked
  expect(dialog.type()).toBe("beforeunload")
  await dialog.dismiss()

  await letGo()
  await expect(status).toHaveAttribute("data-save-status", "saved")
  await expect.poll(() => archive(page)).toMatchObject({ summary: LAMPLIGHT })
})

test.describe("On a phone", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })

  test("the header keeps Undo, with Redo in Search, and still fits", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await expect(undoButton(page)).toBeVisible()
    await expect(redoButton(page)).toBeHidden()
    await expect(saveStatus(page)).toBeHidden()
    const banner = header(page)
    expect(await banner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    for (const button of await banner.getByRole("button").all()) {
      if (!(await button.isVisible())) continue
      const box = await button.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 360, await button.innerText()).toBe(true)
    }

    await focusEnd(editor)
    await page.keyboard.insertText(" The gulls followed her home.")
    await expect(editor).toContainText("The gulls followed her home.")
    await undoButton(page).tap()
    await expect(editor).not.toContainText("The gulls followed her home.")
    await expect(editor).toBeFocused()

    await banner.getByRole("button", { name: "Search", exact: true }).tap()
    const palette = page.getByRole("dialog", { name: "Search" })
    await palette.getByRole("combobox", { name: "Search" }).fill("redo")
    await palette.getByRole("option", { name: /^Redo/ }).tap()
    await expect(editor).toContainText("The gulls followed her home.")
  })
})
