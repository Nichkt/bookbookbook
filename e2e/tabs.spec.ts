import { expect, focusEnd, openFirstChapter, test } from "./fixtures"

test("an edit in one tab shows up in another tab of the same book", async ({ page, context }) => {
  const editor = await openFirstChapter(page)
  const other = await context.newPage()
  await other.goto(page.url())
  const otherEditor = other.getByRole("textbox", { name: "Ferry wake" })
  await expect(otherEditor).toBeVisible()

  await focusEnd(editor)
  await page.keyboard.type(" Written in the first tab.")
  await expect(otherEditor).toContainText("Written in the first tab.")

  await focusEnd(otherEditor)
  await other.keyboard.type(" And answered in the second.")
  await expect(editor).toContainText("Written in the first tab. And answered in the second.")
})
