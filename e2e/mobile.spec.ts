import type { Locator, Page } from "@playwright/test"
import { expect, fakeKeyboard, focusEnd, openFirstChapter, selectText, settle, test } from "./fixtures"

/** The phone's window, and the height of the keyboard fakeKeyboard opens over it. */
const PHONE = { width: 412, height: 915 }
const KEYBOARD = 300

interface ViewElement extends HTMLElement {
  editor: { view: { state: { selection: { head: number } }; coordsAtPos(pos: number): { bottom: number } } }
}

/** How far down the window the caret's bottom edge is. */
const caretBottom = (editor: Locator) =>
  editor.evaluate((element) => {
    const { view } = (element as ViewElement).editor
    return view.coordsAtPos(view.state.selection.head).bottom
  })

const keyboard = (page: Page, height: number) => page.evaluate((height) => window.__keyboard(height), height)

const toastBottom = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--toast-bottom"))

/** Picks a writing tool from the ⋯ menu, where a phone keeps most of them. */
async function fromMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "More writing tools" }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true })

  test("writing tools sit on the on-screen keyboard while the writer types in a scene", async ({ page }) => {
    await fakeKeyboard(page)
    const editor = await openFirstChapter(page)
    const tools = page.getByRole("toolbar", { name: "Writing tools" })
    const tabBar = page.locator("nav[data-sticky-bottom]")
    await expect(tabBar).toBeVisible()

    // Neither the text in focus without a keyboard, as with one plugged in, nor a keyboard for something else.
    await focusEnd(editor)
    await expect(tools).toBeHidden()
    await editor.blur()
    await keyboard(page, KEYBOARD)
    await expect(tools).toBeHidden()

    await focusEnd(editor)
    await expect(tools).toBeVisible()
    const box = (await tools.boundingBox())!
    expect(box.x).toBe(0)
    expect(box.width).toBe(PHONE.width)
    expect(box.y + box.height).toBeCloseTo(PHONE.height - KEYBOARD, 0)
    // The tab bar makes way, and toasts and the bars that float at the foot of the window rise above the tools.
    await expect(tabBar).toBeHidden()
    expect(parseFloat(await toastBottom(page))).toBeCloseTo(KEYBOARD + box.height + 16, 0)

    // Done puts the keyboard away, with the text out of focus.
    await tools.getByRole("button", { name: "Done" }).tap()
    await expect(tools).toBeHidden()
    await expect(editor).not.toBeFocused()
    await keyboard(page, 0)
    await expect(tabBar).toBeVisible()
    expect(parseFloat(await toastBottom(page))).toBe(80)
  })

  test("its tools leave the text in focus, and the keyboard up", async ({ page }) => {
    await fakeKeyboard(page)
    const editor = await openFirstChapter(page)
    const tools = page.getByRole("toolbar", { name: "Writing tools" })
    await focusEnd(editor)
    await keyboard(page, KEYBOARD)
    const undo = tools.getByRole("button", { name: "Undo" })
    const redo = tools.getByRole("button", { name: "Redo" })
    await expect(undo).toBeDisabled()

    await page.keyboard.type(" The tide turned.")
    await expect(editor).toContainText("The tide turned.")
    await undo.tap()
    await expect(editor).not.toContainText("The tide turned.")
    await expect(editor).toBeFocused()
    await redo.tap()
    await expect(editor).toContainText("The tide turned.")
    await expect(editor).toBeFocused()

    await selectText(editor, "tide")
    const bold = tools.getByRole("button", { name: "Bold" })
    await bold.tap()
    await expect(editor.locator("strong", { hasText: "tide" })).toBeVisible()
    await expect(bold).toHaveAttribute("aria-pressed", "true")
    await expect(editor).toBeFocused()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("tide")
  })

  test("they offer to add a new name to the World", async ({ page }) => {
    await fakeKeyboard(page)
    const editor = await openFirstChapter(page)
    const tools = page.getByRole("toolbar", { name: "Writing tools" })
    await focusEnd(editor)
    await keyboard(page, KEYBOARD)
    await page.keyboard.type(" Wren Harrow waved.")
    const offer = tools.getByRole("button", { name: "Add to World" })
    await expect(offer).toBeHidden()

    await selectText(editor, "Wren Harrow")
    await expect(tools.getByRole("button").first()).toHaveAccessibleName("Add to World")
    await offer.tap()
    const dialog = page.getByRole("dialog", { name: "Add to World" })
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Wren Harrow")
  })

  test("the caret stays in sight above them", async ({ page }) => {
    await fakeKeyboard(page)
    const editor = await openFirstChapter(page)
    const tools = page.getByRole("toolbar", { name: "Writing tools" })
    await focusEnd(editor)
    for (let line = 1; line <= 8; line++) {
      await page.keyboard.press("Enter")
      await page.keyboard.type(`Line ${line}.`)
    }
    // Where the browser might leave it as the keyboard comes up: in sight above the keyboard, but where the tools go.
    const behind = PHONE.height - KEYBOARD - 15
    await page.evaluate((by) => window.scrollBy(0, by), (await caretBottom(editor)) - behind)
    expect(await caretBottom(editor)).toBeCloseTo(behind, -1)

    await keyboard(page, KEYBOARD)
    await expect(tools).toBeVisible()
    const top = (await tools.boundingBox())!.y
    expect(behind).toBeGreaterThan(top)
    await expect.poll(() => caretBottom(editor)).toBeLessThanOrEqual(top)

    for (let line = 9; line <= 16; line++) {
      await page.keyboard.press("Enter")
      await page.keyboard.type(`Line ${line}.`)
      await expect.poll(() => caretBottom(editor)).toBeLessThanOrEqual(top)
    }
    await expect(editor).toContainText("Line 16.")
  })

  test("focus mode hides them with the rest", async ({ page }) => {
    await fakeKeyboard(page)
    const editor = await openFirstChapter(page)
    const tools = page.getByRole("toolbar", { name: "Writing tools" })
    await fromMenu(page, "Focus mode")
    const exit = page.getByRole("button", { name: "Exit focus mode" })
    await expect(exit).toBeVisible()

    await focusEnd(editor)
    await keyboard(page, KEYBOARD)
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(tools).toBeHidden()

    await exit.click()
    await focusEnd(editor)
    await expect(tools).toBeVisible()
  })

  test("Write's panel rises from the bottom, and a drag down on its handle closes it", async ({ page }) => {
    await openFirstChapter(page)
    await fromMenu(page, "World")
    const sheet = page.getByRole("dialog", { name: "World" })
    await expect(sheet.getByRole("region", { name: "In this chapter" })).toBeVisible()
    await settle(page)
    // Below the header, so tapping that closes it, and down to the bottom, the width of the screen.
    expect(await sheet.boundingBox()).toEqual({ x: 0, y: 56, width: PHONE.width, height: PHONE.height - 56 })

    const handle = (await sheet.locator("[data-sheet-grabber]").boundingBox())!
    const x = handle.x + handle.width / 2
    const y = handle.y + handle.height / 2

    // Not far enough, and held still before letting go, so not a flick: it springs back.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 150, { steps: 6 })
    await expect.poll(async () => (await sheet.boundingBox())?.y).toBeCloseTo(56 + 150, 0)
    await page.waitForTimeout(200)
    await page.mouse.up()
    await settle(page)
    expect((await sheet.boundingBox())?.y).toBeCloseTo(56, 0)

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 300, { steps: 6 })
    await page.mouse.up()
    await expect(sheet).toBeHidden()
  })
})

test.describe("on a tablet", () => {
  test.use({ viewport: { width: 900, height: 1200 }, isMobile: true, hasTouch: true })

  test("Write's panel comes in from the right, without a handle", async ({ page }) => {
    await openFirstChapter(page)
    await page.getByRole("button", { name: "World", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "World" })
    await expect(sheet.getByRole("region", { name: "In this chapter" })).toBeVisible()
    await settle(page)
    expect(await sheet.boundingBox()).toEqual({ x: 900 - 440, y: 0, width: 440, height: 1200 })
    await expect(sheet.locator("[data-sheet-grabber]")).toBeHidden()
  })
})
