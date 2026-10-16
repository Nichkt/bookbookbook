import { expect, FIRST_LOAD_TIMEOUT, test } from "./fixtures"

/**
 * Desktop Chrome can replay a real IME composition through the DevTools protocol: it fires compositionstart,
 * compositionupdate, beforeinput (insertCompositionText), input and compositionend, as a phone keyboard does.
 * Recomputing highlights mid-composition leaves underlines that never heal; with the guard they stay in sync.
 * This doesn't replace the phone test in docs/ime-smoke-test.md, but it catches regressions in the guard.
 */
test("IME lab: composing a word next to a name keeps the underlines in sync", async ({ page }) => {
  await page.goto("/lab/ime")
  const box = page.getByRole("textbox", { name: "IME test text" })
  await expect(box).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
  await expect(page.getByRole("checkbox", { name: /Composition guard/ })).toBeChecked()

  await page.getByRole("button", { name: "Clear text" }).click()
  await expect(box).toBeFocused()
  await page.keyboard.type("Mara met Jonas ")
  await expect(box.locator(".mention-auto")).toHaveText(["Mara", "Jonas"])

  const cdp = await page.context().newCDPSession(page)
  for (const partial of ["Q", "Qu", "Qui", "Quil", "Quill"]) {
    await cdp.send("Input.imeSetComposition", {
      text: partial,
      selectionStart: partial.length,
      selectionEnd: partial.length,
    })
  }
  await cdp.send("Input.insertText", { text: "Quill" })

  const status = page.getByRole("status")
  await expect(status.getByText("Underlines in sync")).toBeVisible()
  await expect(status.getByText("Text: screen = model")).toBeVisible()
  await expect(box.locator(".mention-auto")).toHaveText(["Mara", "Jonas Quill"])
  await expect(page.getByRole("list", { name: "Event log" })).toContainText("compositionend")
})
