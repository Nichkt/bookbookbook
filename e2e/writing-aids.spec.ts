import type { Locator, Page } from "@playwright/test"
import { expect, fakeSpeech, focusEnd, openFirstChapter, queryDb, selectText, settleAll, test } from "./fixtures"

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })
/** An entry's heading in the World panel beside the text. */
const panelHeading = (page: Page, name: string) =>
  page.getByRole("complementary", { name: "World" }).getByRole("heading", { level: 2, name, exact: true })
const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString())
/** Longer than the bubble waits after a selection, to show it hasn't come. */
const BUBBLE_WAIT = 500
/**
 * A device pref as saved. A read waits for the saves asked for before it, so once it shows a choice, every save
 * before it has landed, and a reload keeps them.
 */
const savedPref = async (page: Page, id: string) =>
  (await queryDb<{ value: string }>(page, "SELECT value FROM ui_prefs WHERE id = ?", [id]))[0]?.value ?? null

test.describe("Add to World", () => {
  const bubble = (page: Page) => page.locator("[data-add-to-world]").getByRole("button", { name: "Add to World" })
  const dialog = (page: Page) => page.getByRole("dialog", { name: "Add to World" })
  const ENTRY_SQL = `SELECT t.key AS type, e.aliases, e.notes FROM codex_entries e
    JOIN codex_types t ON t.id = e.type_id WHERE e.name = ? AND e.deleted_at IS NULL`

  test("adds a name selected in the text, from a bubble that Tab reaches", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    await page.keyboard.type(" Wren Harrow's boat.")
    await selectText(editor, "Wren Harrow’s")
    await expect(bubble(page)).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(bubble(page)).toBeFocused()
    await page.keyboard.press("Enter")

    // The name comes without its possessive, as a character, with the shorter names it might go by on offer.
    const form = dialog(page)
    const name = form.getByRole("textbox", { name: "Name" })
    await expect(name).toHaveValue("Wren Harrow")
    await expect(name).toBeFocused()
    await expect(form.getByRole("combobox", { name: "Type" })).toHaveText("Character")
    await expect(form.getByRole("checkbox", { name: "Harrow" })).not.toBeChecked()
    await form.getByRole("checkbox", { name: "Wren" }).check()
    await form.getByRole("textbox", { name: "Notes (optional)" }).fill("Runs the night ferry.")
    await form.getByRole("button", { name: "Add to World" }).click()
    await expect(form).toBeHidden()

    const [entry] = await queryDb<{ type: string; aliases: string; notes: string }>(page, ENTRY_SQL, ["Wren Harrow"])
    expect(entry.type).toBe("characters")
    expect(JSON.parse(entry.aliases)).toEqual(["Wren"])
    expect(entry.notes).toContain("Runs the night ferry.")
    // The text underlines it at once, and the caret waits where the selection ended.
    await expect(editor).toBeFocused()
    await expect(editor.locator(".mention-auto", { hasText: "Wren Harrow" })).toBeVisible()
    await expect(bubble(page)).toHaveCount(0)

    // Details opens it beside the text, without taking the caret.
    await toast(page, "Added “Wren Harrow” to the World.").getByRole("button", { name: "Details" }).click()
    await expect(panelHeading(page, "Wren Harrow")).toBeVisible()
    await expect(editor).toBeFocused()
    await page.keyboard.type("!")
    await expect(editor).toContainText("Wren Harrow’s! boat.")
  })

  test("leaves be names the World has and words that open sentences; Esc and Cancel go back", async ({ page }) => {
    const editor = await openFirstChapter(page)
    for (const text of ["Jonas", "Grayhaven Light", "When"]) {
      await selectText(editor, text)
      await page.waitForTimeout(BUBBLE_WAIT)
      await expect(bubble(page)).toHaveCount(0)
    }

    await focusEnd(editor)
    await page.keyboard.type(" Wren")
    await selectText(editor, "Wren")
    await expect(bubble(page)).toBeVisible()
    // Esc puts the bubble away and goes back to the text, and it stays away from that selection.
    await page.keyboard.press("Tab")
    await page.keyboard.press("Escape")
    await expect(bubble(page)).toHaveCount(0)
    await expect(editor).toBeFocused()
    await page.waitForTimeout(BUBBLE_WAIT)
    await expect(bubble(page)).toHaveCount(0)
    expect(await selectedText(page)).toBe("Wren")

    // Another selection brings it back. Cancel goes back to the text, with the name still selected.
    await selectText(editor, " Wren")
    await bubble(page).click()
    await expect(dialog(page).getByRole("textbox", { name: "Name" })).toHaveValue("Wren")
    await page.keyboard.press("Escape")
    await expect(dialog(page)).toBeHidden()
    await expect(editor).toBeFocused()
    await expect.poll(() => selectedText(page)).toBe(" Wren")
  })

  test("comes from the ⋯ menu for any name, and warns of one the World has", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    const form = dialog(page)
    const name = form.getByRole("textbox", { name: "Name" })
    const type = form.getByRole("combobox", { name: "Type" })
    const fromMenu = async () => {
      await page.getByRole("button", { name: "More writing tools" }).click()
      await page.getByRole("menuitem", { name: "Add to World…" }).click()
      await expect(name).toBeFocused()
    }

    await fromMenu()
    await expect(name).toHaveValue("")
    await form.getByRole("button", { name: "Add to World" }).click()
    await expect(form.getByText("Give it a name.")).toBeVisible()
    await expect(name).toBeFocused()
    await name.fill("agnes")
    await expect(form).toContainText("The World already has “Agnes Morrow”.")
    await name.fill("Silver amulet")
    await type.click()
    await page.getByRole("option", { name: "Event" }).click()
    await expect(form).toContainText("The text doesn't underline events")
    await type.click()
    await page.getByRole("option", { name: "Object" }).click()
    await form.getByRole("button", { name: "Add to World" }).click()
    await expect(form).toBeHidden()
    await expect(editor).toBeFocused()
    const [entry] = await queryDb<{ type: string }>(page, ENTRY_SQL, ["Silver amulet"])
    expect(entry.type).toBe("objects")

    // The type used last comes first. "Show it" opens the entry the World has beside the text.
    await fromMenu()
    await expect(type).toHaveText("Object")
    await name.fill("Agnes")
    await form.getByRole("button", { name: "Show it" }).click()
    await expect(form).toBeHidden()
    await expect(panelHeading(page, "Agnes Morrow")).toBeVisible()
    await expect(editor).toBeFocused()
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

    test("comes from the ⋯ menu, leaving the bubble's place to the system's", async ({ page }) => {
      const editor = await openFirstChapter(page)
      await focusEnd(editor)
      await page.keyboard.type(" Wren")
      await selectText(editor, "Wren")
      await page.waitForTimeout(BUBBLE_WAIT)
      await expect(bubble(page)).toHaveCount(0)
      const fromMenu = async () => {
        await page.getByRole("button", { name: "More writing tools" }).click()
        await page.getByRole("menuitem", { name: "Add to World…" }).click()
      }

      await fromMenu()
      const form = dialog(page)
      await expect(form.getByRole("textbox", { name: "Name" })).toHaveValue("Wren")
      await form.getByRole("button", { name: "Add to World" }).click()
      await expect(form).toBeHidden()
      await expect(editor).toBeFocused()

      // "Show it" opens the World sheet at the entry, and closing it goes back to the text.
      await fromMenu()
      await form.getByRole("textbox", { name: "Name" }).fill("Agnes")
      await form.getByRole("button", { name: "Show it" }).click()
      const sheet = page.getByRole("dialog", { name: "World" })
      await expect(sheet.getByRole("heading", { level: 2, name: "Agnes Morrow", exact: true })).toBeFocused()
      await page.keyboard.press("Escape")
      await expect(sheet).toBeHidden()
      await expect(editor).toBeFocused()
    })
  })
})

test.describe("Read aloud", () => {
  test.beforeEach(({ page }) => fakeSpeech(page))

  const MARA =
    "Mara Quill stood at the rail and watched North Quay rise from the mist: gulls worried the pilings, ropes " +
    "knocked their wooden complaints against masts, and every roof wore the same pewter sheen of salt."
  const JONAS = "Jonas waited below the crane with his cap pulled low."
  const SHOULDERS =
    "He had their father's shoulders and none of Thomas's stillness; even standing still, Jonas looked as if he " +
    "were bargaining with the weather."
  const LIGHT = "Grayhaven Light sat above the town with its lantern dark at noon."
  const ABSENCE =
    "Now the windows stared down blankly, and Mara felt the old map inside her redraw itself around an absence."

  const bar = (page: Page) => page.getByRole("region", { name: "Read aloud", exact: true })
  const spoken = (page: Page) => page.evaluate(() => window.__speech.spoken)
  const lastSaid = (page: Page) => page.evaluate(() => window.__speech.spoken.at(-1)?.text)
  const finishSentence = (page: Page) => page.evaluate(() => window.__speech.finish())
  /** The text marked as being read. */
  const marked = (editor: Locator) =>
    editor.evaluate((element) =>
      [...element.querySelectorAll(".read-aloud")].map((span) => span.textContent).join(""),
    )

  interface ReadingEditor extends HTMLElement {
    editor: {
      state: {
        selection: { from: number; empty: boolean }
        doc: {
          content: { size: number }
          textBetween(from: number, to: number): string
          descendants(visit: (node: { isText: boolean; text?: string }, pos: number) => void): void
        }
      }
      chain(): {
        focus(): { setTextSelection(pos: number): { run(): boolean } }
        insertContentAt(pos: number, content: { type: string }[]): { run(): boolean }
      }
    }
  }

  /** Puts the caret just before where a scene first has `text`. */
  const caretAt = (editor: Locator, text: string) =>
    expect
      .poll(() =>
        editor.evaluate((element, text) => {
          const { editor } = element as ReadingEditor
          let at = -1
          editor.state.doc.descendants((node, pos) => {
            const index = at < 0 && node.isText ? (node.text ?? "").indexOf(text) : -1
            if (index >= 0) at = pos + index
          })
          return at >= 0 && editor.chain().focus().setTextSelection(at).run()
        }, text),
      )
      .toBe(true)
  /** The text just after the caret, when there's no selection. */
  const afterCaret = (editor: Locator) =>
    editor.evaluate((element) => {
      const { state } = (element as ReadingEditor).editor
      const { from, empty } = state.selection
      return empty ? state.doc.textBetween(from, Math.min(from + 12, state.doc.content.size)) : null
    })

  async function readAloud(page: Page) {
    await page.getByRole("button", { name: "More writing tools" }).click()
    await page.getByRole("menuitem", { name: "Read aloud", exact: true }).click()
    await expect(bar(page).getByRole("button", { name: "Pause" })).toBeFocused()
  }

  test("reads on from the caret's sentence, marking each, and the bar works it", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await caretAt(editor, "watched North Quay")
    await readAloud(page)
    await expect.poll(() => marked(editor)).toBe(MARA)
    await expect.poll(() => lastSaid(page)).toBe(MARA)

    await finishSentence(page)
    await expect.poll(() => marked(editor)).toBe(JONAS)
    await expect.poll(() => lastSaid(page)).toBe(JONAS)

    const controls = bar(page)
    await controls.getByRole("button", { name: "Next sentence" }).click()
    await expect.poll(() => marked(editor)).toBe(SHOULDERS)
    await expect.poll(() => lastSaid(page)).toBe(SHOULDERS)
    await controls.getByRole("button", { name: "Previous sentence" }).click()
    await expect.poll(() => marked(editor)).toBe(JONAS)

    // Pause stops the voice. Resume says the sentence again, from its start.
    await expect.poll(() => lastSaid(page)).toBe(JONAS)
    await controls.getByRole("button", { name: "Pause" }).click()
    const said = (await spoken(page)).length
    await expect(controls.getByRole("button", { name: "Resume" })).toBeFocused()
    await page.waitForTimeout(200)
    expect(await spoken(page)).toHaveLength(said)
    await controls.getByRole("button", { name: "Resume" }).click()
    await expect.poll(async () => (await spoken(page)).length).toBe(said + 1)
    expect(await lastSaid(page)).toBe(JONAS)

    // Esc stops it, though it closes a tooltip too, and the caret waits at the sentence it was on.
    await page.keyboard.press("Tab")
    await expect(page.getByRole("tooltip", { name: "Next sentence" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(controls).toBeHidden()
    await expect(editor).toBeFocused()
    expect(await marked(editor)).toBe("")
    expect(await afterCaret(editor)).toBe("Jonas waited")
  })

  test("reads just the selection, and typing stops it", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await selectText(editor, "Jonas looked as if he were bargaining with the weather. When Mara embraced him")
    await readAloud(page)
    await expect.poll(() => lastSaid(page)).toBe("Jonas looked as if he were bargaining with the weather.")
    await finishSentence(page)
    await expect.poll(() => lastSaid(page)).toBe("When Mara embraced him")
    await expect.poll(() => marked(editor)).toBe("When Mara embraced him")

    // At its end the caret goes back to the text, after what was read.
    await finishSentence(page)
    await expect(bar(page)).toBeHidden()
    await expect(editor).toBeFocused()
    expect(await afterCaret(editor)).toBe(", he smelled")

    await readAloud(page)
    await expect.poll(() => lastSaid(page)).toMatch(/^When Mara embraced him, he smelled of herring/)
    await focusEnd(editor)
    await expect(bar(page)).toBeVisible()
    await page.keyboard.type(" Rain.")
    await expect(bar(page)).toBeHidden()
    await expect(editor).toContainText("redraw itself around an absence. Rain.")
    expect(await marked(editor)).toBe("")
  })

  test("speed and voice change as it reads, and are kept for next time", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await caretAt(editor, LIGHT)
    await readAloud(page)
    await expect.poll(() => spoken(page)).toEqual([{ text: LIGHT, rate: 1, voice: "ann" }])

    const controls = bar(page)
    await controls.getByRole("combobox", { name: "Speed" }).click()
    await page.getByRole("option", { name: "1.5×" }).click()
    await expect.poll(async () => (await spoken(page)).at(-1)).toEqual({ text: LIGHT, rate: 1.5, voice: "ann" })

    // The voice on the device comes first. Online voices are marked as such.
    const voice = controls.getByRole("combobox", { name: "Voice" })
    await expect(voice).toHaveText("Ann")
    await voice.click()
    await expect(page.getByRole("option")).toHaveText(["Ann", "Bo (online)"])
    await page.getByRole("option", { name: "Bo (online)" }).click()
    await expect.poll(async () => (await spoken(page)).at(-1)).toEqual({ text: LIGHT, rate: 1.5, voice: "bo" })

    // Esc closes an open list without stopping.
    await voice.click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toBeHidden()
    await expect(controls).toBeVisible()

    const prefs = await queryDb<{ id: string; value: string }>(
      page,
      "SELECT id, value FROM ui_prefs WHERE id LIKE 'write.readAloud.%' ORDER BY id",
    )
    expect(prefs).toEqual([
      { id: "write.readAloud.rate", value: "1.5" },
      { id: "write.readAloud.voice", value: "bo" },
    ])
  })

  test("stops at the end of the view: the chapter, or in the Manuscript the book", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await caretAt(editor, ABSENCE)
    await readAloud(page)
    await expect.poll(() => lastSaid(page)).toBe(ABSENCE)
    await finishSentence(page)
    await expect(bar(page)).toBeHidden()

    await page.getByRole("radio", { name: "Manuscript" }).click()
    const ferry = page.getByRole("textbox", { name: "Ferry wake" })
    await caretAt(ferry, ABSENCE)
    await readAloud(page)
    await expect.poll(() => lastSaid(page)).toBe(ABSENCE)
    await finishSentence(page)
    const next = page.getByRole("textbox", { name: "The locked room" })
    await expect.poll(() => lastSaid(page)).toBe("The keeper's room had kept his shape.")
    await expect.poll(() => marked(next)).toBe("The keeper's room had kept his shape.")
    expect(await marked(ferry)).toBe("")
    await expect(next.locator(".read-aloud").first()).toBeInViewport()
  })

  test("in the Manuscript, reads on into a scene whose text hasn't loaded yet", async ({ page }) => {
    await openFirstChapter(page)
    await page.getByRole("radio", { name: "Manuscript" }).click()
    const ferry = page.getByRole("textbox", { name: "Ferry wake" })
    const next = page.getByRole("textbox", { name: "The locked room" })
    // Blank lines after the scene's last sentence take the next scene far enough down for its text to go.
    await ferry.evaluate((element) => {
      const { editor } = element as ReadingEditor
      const blank = Array.from({ length: 200 }, () => ({ type: "paragraph" }))
      editor.chain().insertContentAt(editor.state.doc.content.size, blank).run()
    })
    await caretAt(ferry, ABSENCE)
    await expect(next).toHaveCount(0)

    await readAloud(page)
    await expect.poll(() => lastSaid(page)).toBe(ABSENCE)
    await finishSentence(page)
    await expect.poll(() => marked(next)).toBe("The keeper's room had kept his shape.")
    expect(await lastSaid(page)).toBe("The keeper's room had kept his shape.")
    await expect(bar(page)).toBeVisible()
    await expect(next.locator(".read-aloud").first()).toBeInViewport()
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

    test("starts from the ⋯ menu, with the bar in the screen above the tabs", async ({ page }) => {
      const editor = await openFirstChapter(page)
      await caretAt(editor, LIGHT)
      await readAloud(page)
      await expect.poll(() => lastSaid(page)).toBe(LIGHT)
      const box = (await bar(page).boundingBox())!
      const tabs = (await page.getByRole("navigation", { name: "Screens" }).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(412)
      expect(box.y + box.height).toBeLessThanOrEqual(tabs.y)

      await bar(page).getByRole("button", { name: "Stop reading" }).click()
      await expect(bar(page)).toBeHidden()
      await expect(editor).toBeFocused()
      expect(await afterCaret(editor)).toBe("Grayhaven Li")
    })
  })
})

/** How far the caret's line is from the middle of the window below the toolbar, where typewriter scrolling keeps it. */
const caretOffMiddle = (page: Page) =>
  page.evaluate(() => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return Number.POSITIVE_INFINITY
    const caret = selection.getRangeAt(0).getBoundingClientRect()
    const bar = document.querySelector("[data-write-toolbar]")?.getBoundingClientRect().bottom ?? 0
    return Math.abs((caret.top + caret.bottom) / 2 - (bar + window.innerHeight) / 2)
  })

test.describe("Focus mode", () => {
  const exit = (page: Page) => page.getByRole("button", { name: "Exit focus mode" })
  const appHeader = (page: Page) => page.locator("header[data-sticky-top]")

  test("Ctrl+. leaves only the text, dimming the paragraphs not being written; Esc ends it", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    await page.keyboard.press("Control+.")
    await expect(exit(page)).toBeVisible()
    await expect(appHeader(page)).toBeHidden()
    await expect(page.getByRole("button", { name: "Bold" })).toHaveCount(0)
    await expect(editor).toBeFocused()
    const paragraphs = editor.locator("p")
    await expect(paragraphs.last()).toHaveCSS("opacity", "1")
    await expect(paragraphs.first()).toHaveCSS("opacity", "0.3")

    // Its bar fades while the writer types, and comes back as the pointer moves.
    const bar = page.locator("[data-write-toolbar]")
    await page.keyboard.type(" And the sea went on.")
    await expect(bar).toHaveCSS("opacity", "0")
    await page.mouse.move(40, 300)
    await page.mouse.move(50, 310)
    await expect(bar).toHaveCSS("opacity", "1")

    await page.keyboard.press("Escape")
    await expect(exit(page)).toBeHidden()
    await expect(appHeader(page)).toBeVisible()
    await expect(paragraphs.first()).toHaveCSS("opacity", "1")
    await expect(editor).toBeFocused()
    await page.keyboard.type(" Still.")
    await expect(editor).toContainText("And the sea went on. Still.")
  })

  test("typewriter scrolling keeps the line being written mid-window, and is remembered", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    await page.getByRole("button", { name: "More writing tools" }).click()
    await page.getByRole("menuitemcheckbox", { name: "Typewriter scrolling" }).click()
    await expect(editor).toBeFocused()
    for (let line = 0; line < 4; line++) {
      await page.keyboard.press("Enter")
      await page.keyboard.type("Another line of the crossing.")
    }
    await expect.poll(() => caretOffMiddle(page)).toBeLessThan(8)

    await expect.poll(() => savedPref(page, "write.typewriter")).toBe("on")
    await page.reload()
    await page.getByRole("button", { name: "More writing tools" }).click()
    await expect(page.getByRole("menuitemcheckbox", { name: "Typewriter scrolling" })).toBeChecked()
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

    test("comes from the ⋯ menu, and takes the tabs away too", async ({ page }) => {
      const editor = await openFirstChapter(page)
      await focusEnd(editor)
      await page.getByRole("button", { name: "More writing tools" }).click()
      await page.getByRole("menuitem", { name: "Focus mode" }).click()
      await expect(exit(page)).toBeVisible()
      const tabs = page.getByRole("navigation", { name: "Screens" })
      await expect(tabs).toBeHidden()
      await exit(page).click()
      await expect(exit(page)).toBeHidden()
      await expect(tabs).toBeVisible()
    })
  })
})

test.describe("Goals and sprints", () => {
  const today = (page: Page) => page.getByRole("button", { name: /^Today:/ })
  const goals = (page: Page) => page.getByRole("dialog", { name: "Goals and sprints" })
  const sprintClock = (page: Page) => page.getByRole("button", { name: /^Sprint:/ })

  test("a daily goal set from Today counts the day's words, and says when they reach it", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await today(page).click()
    await goals(page).getByRole("textbox", { name: "Daily goal" }).fill("10")
    await expect
      .poll(async () => (await queryDb<{ daily_goal: number }>(page, "SELECT daily_goal FROM books"))[0])
      .toEqual({ daily_goal: 10 })
    await page.keyboard.press("Escape")
    await expect(goals(page)).toBeHidden()
    await expect(today(page)).toBeFocused()
    await expect(today(page)).toHaveAccessibleName(/daily goal 10/)

    await focusEnd(editor)
    await page.keyboard.type(" One two three four five six seven eight nine ten eleven twelve.")
    await settleAll(page)
    await expect(toast(page, "Daily goal met")).toContainText(/Daily goal met: \d+ words today/)
  })

  test("a sprint goes back to the text, runs on through a reload, and ends on time", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    await today(page).click()
    await goals(page).getByRole("button", { name: "Start a 15-minute sprint" }).click()
    await expect(goals(page)).toBeHidden()
    await expect(editor).toBeFocused()
    await page.keyboard.type(" Sprinting now with four.")
    await settleAll(page)
    await expect(sprintClock(page)).toBeVisible()

    // It runs on through a reload.
    await page.reload()
    await expect(sprintClock(page)).toBeVisible()

    // With a few seconds of it left, it finishes after another: on time, or as the page opens if that takes longer.
    await page.evaluate(() => {
      const sprint = JSON.parse(localStorage.getItem("bbb.sprint") ?? "null")
      sprint.startedAt = Date.now() - sprint.minutes * 60_000 + 3000
      localStorage.setItem("bbb.sprint", JSON.stringify(sprint))
    })
    await page.reload()
    await expect(toast(page, "Sprint done")).toContainText(/Sprint done: \d+ words? in 15 minutes/, { timeout: 15_000 })
    await expect(today(page)).toBeVisible()
    const [stats] = await queryDb<{ sprints: number }>(page, "SELECT SUM(sprints) AS sprints FROM writing_stats")
    expect(stats.sprints).toBe(1)
  })

  test("focus mode's bar has Today, and stopping a sprint keeps focus in the popover", async ({ page }) => {
    await openFirstChapter(page)
    await page.keyboard.press("Control+.")
    await today(page).click()
    await goals(page).getByRole("button", { name: "Start a 25-minute sprint" }).click()
    await sprintClock(page).click()
    await goals(page).getByRole("button", { name: "Stop sprint" }).click()
    await expect(goals(page).getByRole("button", { name: "Start a 15-minute sprint" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(today(page)).toBeFocused()
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test("open from the ⋯ menu, and a sprint shows its clock in the toolbar", async ({ page }) => {
      await openFirstChapter(page)
      const menu = page.getByRole("button", { name: "More writing tools" })
      await menu.click()
      await page.getByRole("menuitem", { name: "Goals and sprints…" }).click()
      await expect(goals(page)).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(menu).toBeFocused()

      await menu.click()
      await page.getByRole("menuitem", { name: "Goals and sprints…" }).click()
      await goals(page).getByRole("button", { name: "Start a 45-minute sprint" }).click()
      await expect(sprintClock(page)).toBeInViewport({ ratio: 1 })
    })
  })
})

test.describe("Find and replace", () => {
  const panel = (page: Page) => page.locator("[data-find-panel]")
  const findBox = (page: Page) => page.getByRole("textbox", { name: "Find", exact: true })
  const replaceBox = (page: Page) => page.getByRole("textbox", { name: "Replace with" })
  const status = (page: Page) => panel(page).getByRole("status")
  const result = (page: Page, text: string) => panel(page).locator("[data-find-result]").filter({ hasText: text })
  const scene = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true })
  /** The match the panel is on, as marked in a scene's text. */
  const currentMatch = (editor: Locator) => editor.locator(".find-match-current")

  async function openFind(page: Page) {
    await page.getByRole("button", { name: "Find", exact: true }).click()
    await expect(findBox(page)).toBeFocused()
  }

  test("searches the whole book, listing by chapter, and Enter goes from match to match", async ({ page }) => {
    await openFirstChapter(page)
    await openFind(page)
    await findBox(page).fill("ledger")
    await expect(status(page)).toHaveText("2 matches in 2 chapters")
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText([
      /^Chapter 2: The Keeper's Room/,
      /^Chapter 3: The Drowned Bell/,
    ])
    await expect(result(page, "the Salt Ledger")).toBeVisible()

    const matchCase = panel(page).getByRole("button", { name: "Match case" })
    await matchCase.click()
    await expect(matchCase).toHaveAttribute("aria-pressed", "true")
    await expect(status(page)).toHaveText("1 match in 1 chapter")
    await matchCase.click()
    const wholeWords = panel(page).getByRole("button", { name: "Whole words" })
    await findBox(page).fill("ledge")
    await expect(status(page)).toHaveText("2 matches in 2 chapters")
    await wholeWords.click()
    await expect(status(page)).toHaveText("No matches")
    await wholeWords.click()

    // Enter goes on through the book, chapter by chapter, keeping the search ready for more.
    await findBox(page).fill("ledger")
    await findBox(page).press("Enter")
    await expect(status(page)).toHaveText("Match 1 of 2")
    await expect(currentMatch(scene(page, "The locked room"))).toHaveText("Ledger")
    await expect(currentMatch(scene(page, "The locked room"))).toBeInViewport()
    await expect(findBox(page)).toBeFocused()
    const keepersRoom = page.url()
    await page.keyboard.press("Enter")
    await expect(status(page)).toHaveText("Match 2 of 2")
    await expect(currentMatch(scene(page, "Pub light"))).toBeInViewport()
    await page.keyboard.press("Shift+Enter")
    await expect(currentMatch(scene(page, "The locked room"))).toBeInViewport()
    // Pressed together, they still end at the match they say, not at a chapter still on its way.
    await page.keyboard.press("Enter")
    await page.keyboard.press("Shift+Enter")
    await expect(status(page)).toHaveText("Match 1 of 2")
    await expect(page).toHaveURL(keepersRoom)
    await expect(currentMatch(scene(page, "The locked room"))).toBeInViewport()

    // A result selects its match in the text, ready to type over.
    await result(page, "satchel").click()
    await expect(scene(page, "Pub light")).toBeFocused()
    await expect.poll(() => selectedText(page)).toBe("ledger")

    // The Manuscript scrolls to them instead.
    await page.getByRole("radio", { name: "Manuscript" }).click()
    await findBox(page).press("Enter")
    await expect(status(page)).toHaveText("Match 1 of 2")
    await expect(currentMatch(scene(page, "The locked room"))).toBeInViewport()
  })

  test("Replace goes to the match first, then replaces it, and Ctrl+Z in the text undoes it", async ({ page }) => {
    await openFirstChapter(page)
    await openFind(page)
    await findBox(page).fill("paraffin")
    await replaceBox(page).fill("kerosene")
    const replace = panel(page).getByRole("button", { name: "Replace", exact: true })
    await replace.click()
    await expect(status(page)).toHaveText("Match 1 of 1")
    const pubLight = scene(page, "Pub light")
    await expect(currentMatch(pubLight)).toHaveText("paraffin")
    await replaceBox(page).press("Enter")
    await expect(pubLight).toContainText("the smell of kerosene and salt")
    await expect(status(page)).toHaveText("No matches")

    await focusEnd(pubLight)
    await page.keyboard.press("Control+z")
    await expect(pubLight).toContainText("the smell of paraffin and salt")
    await expect(status(page)).toHaveText("1 match in 1 chapter")
  })

  test("Replace all changes every chapter, keeping a version of each scene, and Undo puts it back", async ({ page }) => {
    await openFirstChapter(page)
    await openFind(page)
    await findBox(page).fill("ledger")
    await replaceBox(page).fill("logbook")
    await panel(page).getByRole("button", { name: "Replace all" }).click()
    const replaced = toast(page, "Replaced 2 matches in 2 scenes")
    await expect(replaced).toBeVisible()
    await expect(status(page)).toHaveText("No matches")
    await findBox(page).fill("logbook")
    await expect(status(page)).toHaveText("2 matches in 2 chapters")
    const versions = await queryDb<{ label: string; kind: string }>(
      page,
      "SELECT label, kind FROM snapshots WHERE label LIKE 'Before replacing%'",
    )
    expect(versions).toEqual([
      { label: "Before replacing “ledger”", kind: "auto" },
      { label: "Before replacing “ledger”", kind: "auto" },
    ])

    await replaced.getByRole("button", { name: "Undo" }).click()
    await expect(status(page)).toHaveText("No matches")
    await findBox(page).fill("ledger")
    await expect(status(page)).toHaveText("2 matches in 2 chapters")
  })

  test("a pattern with a mistake says so, and searches nothing", async ({ page }) => {
    await openFirstChapter(page)
    await openFind(page)
    const pattern = panel(page).getByRole("button", { name: "Pattern", exact: true })
    await pattern.click()
    await expect(pattern).toHaveAttribute("aria-pressed", "true")
    await findBox(page).fill("(ledger")
    const mistake = "This pattern has a mistake in it, so nothing was searched."
    await expect(findBox(page)).toHaveAttribute("aria-invalid", "true")
    await expect(findBox(page)).toHaveAccessibleDescription(mistake)
    await expect(panel(page).getByRole("button", { name: "Replace all" })).toBeDisabled()
    await findBox(page).fill("ledg(er|ers)")
    await expect(findBox(page)).not.toHaveAttribute("aria-invalid")
    await expect(status(page)).toHaveText("2 matches in 2 chapters")

    // Its "?" explains patterns, and Escape closes only the glossary.
    const hint = panel(page).getByRole("button", { name: "What does “Pattern” mean?" })
    await hint.click()
    const glossary = page.getByRole("dialog", { name: "Glossary" })
    await expect(glossary.getByRole("article", { name: "Pattern", exact: true })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(glossary).toBeHidden()
    await expect(hint).toBeFocused()
    await expect(findBox(page)).toHaveValue("ledg(er|ers)")
  })

  test("Ctrl+Shift+F searches for the words selected, and Esc goes back to the match", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await selectText(editor, "harbor")
    await page.keyboard.press("Control+Shift+F")
    await expect(findBox(page)).toBeFocused()
    await expect(findBox(page)).toHaveValue("harbor")
    await expect(status(page)).toHaveText("2 matches in 2 chapters")

    // On from the selection, to the next.
    await page.keyboard.press("Enter")
    await expect(status(page)).toHaveText("Match 2 of 2")
    const offer = scene(page, "Elias's offer")
    await expect(currentMatch(offer)).toHaveText("Harbor")
    await page.keyboard.press("Escape")
    await expect(panel(page)).toBeHidden()
    await expect(offer).toBeFocused()
    await expect.poll(() => selectedText(page)).toBe("Harbor")
  })

  test("its button opens and closes it, however quickly pressed, and it's remembered", async ({ page }) => {
    await openFirstChapter(page)
    const button = page.getByRole("button", { name: "Find", exact: true })
    await button.click()
    await button.click()
    await button.click()
    await expect(button).toHaveAttribute("aria-expanded", "true")
    // Saving each press takes a moment; the first saves landing mustn't close it again.
    await expect.poll(() => savedPref(page, "write.panel")).toBe("find")
    await expect(panel(page)).toBeVisible()
    await page.reload()
    await expect(panel(page)).toBeVisible()
    await button.click()
    await expect(panel(page)).toBeHidden()
  })

  test.describe("on a narrow screen", () => {
    test.use({ viewport: { width: 600, height: 800 } })

    test("it's a sheet over the text, which a result closes to select its match", async ({ page }) => {
      const editor = await openFirstChapter(page)
      await focusEnd(editor)
      await page.keyboard.press("Control+Shift+F")
      const sheet = page.getByRole("dialog", { name: "Find and replace" })
      await expect(sheet).toBeVisible()
      await expect(findBox(page)).toBeFocused()
      await findBox(page).fill("ledger")
      await expect(status(page)).toHaveText("2 matches in 2 chapters")
      await result(page, "satchel").click()
      await expect(sheet).toBeHidden()
      await expect(scene(page, "Pub light")).toBeFocused()
      await expect.poll(() => selectedText(page)).toBe("ledger")
    })
  })
})
