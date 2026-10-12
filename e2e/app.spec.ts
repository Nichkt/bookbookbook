import { expect, flushAll, focusEnd, openFirstChapter, test } from "./fixtures"

test("opens the sample book at its first chapter, with codex names underlined", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await expect(page.getByRole("heading", { level: 1, name: "The Ferry Home" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Chapters" }).getByRole("link")).toHaveCount(5)
  await expect(editor.locator(".mention-auto").first()).toBeVisible()
})

test("keeps typed text across a reload, and underlines names as you type them", async ({ page }) => {
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  await page.keyboard.press("Enter")
  await page.keyboard.type("Mara checked the tide tables twice.")
  await expect(editor.locator("p", { hasText: "tide tables" }).locator(".mention-auto")).toHaveText("Mara")

  await flushAll(page)
  await page.reload()
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toContainText("Mara checked the tide tables twice.")
})

test("compaction folds a scene's rows into one snapshot without losing text", async ({ page }) => {
  const editor = await openFirstChapter(page)
  const sceneId = await page.locator("section[data-scene-id]", { has: editor }).getAttribute("data-scene-id")
  await focusEnd(editor)
  await page.keyboard.type(" One. Two. Three.")
  await flushAll(page)

  const rows = () =>
    page.evaluate(async (id) => {
      const { db } = window.__bbb
      const count = async (sql: string) => (await db.getAll<{ n: number }>(sql, [id]))[0].n
      return {
        updates: await count("SELECT count(*) AS n FROM scene_updates WHERE scene_id = ?"),
        snapshots: await count("SELECT count(*) AS n FROM snapshots WHERE scene_id = ? AND kind = 'compaction'"),
      }
    }, sceneId)
  expect((await rows()).updates).toBeGreaterThan(0)

  await page.evaluate(() => window.__bbb.compactAll())
  expect(await rows()).toEqual({ updates: 0, snapshots: 1 })

  await page.reload()
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toContainText("One. Two. Three.")
})

test("an empty chapter opens on a blank page you can type into", async ({ page }) => {
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("link", { name: /The Archive/ }).click()
  await expect(page.getByRole("heading", { level: 1, name: "The Archive" })).toBeVisible()

  const text = page.getByRole("textbox", { name: "Chapter text" })
  await focusEnd(text)
  await page.keyboard.type("It began in the archive.")
  await flushAll(page)
  await page.reload()
  await expect(page.getByRole("textbox", { name: "Chapter text" })).toHaveText("It began in the archive.")
})

test("remembers the theme", async ({ page }) => {
  await openFirstChapter(page)
  const theme = page.getByRole("radiogroup", { name: "Theme" })
  await theme.getByRole("radio", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")

  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked()
})

test.describe("on a phone-sized screen", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

  test("switches chapters with the picker and shows the bottom tabs", async ({ page }) => {
    await openFirstChapter(page)
    await expect(page.getByRole("navigation", { name: "Chapters" })).toBeHidden()
    await page.getByLabel("Chapter", { exact: true }).selectOption({ label: "3. The Drowned Bell" })
    await expect(page.getByRole("heading", { level: 1, name: "The Drowned Bell" })).toBeVisible()

    const tabs = page.getByRole("navigation", { name: "Screens" })
    await expect(tabs.getByRole("link", { name: "Write" })).toBeVisible()
    await expect(tabs.getByRole("link", { name: "Write" })).toHaveAttribute("aria-current", "page")
  })
})
