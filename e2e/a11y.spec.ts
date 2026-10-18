import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import {
  expect,
  fakeAi,
  fakeDictation,
  fakeKeyboard,
  fakeSpeech,
  FIRST_LOAD_TIMEOUT,
  focusEnd,
  LOCAL_AI,
  offerInstall,
  openFirstChapter,
  seedBackupRecord,
  selectText,
  settle,
  test,
} from "./fixtures"

const THEMES = ["light", "sepia", "dark"] as const

/**
 * WCAG 2.2 A and AA, the target in DESIGN.md §17, as far as axe can tell, and axe's best practices, which catch the
 * likes of a dialog without a name.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]

/** The rules among those that look at colors. The themes change nothing else (index.css), so only these can differ. */
const COLOR_RULES = ["color-contrast", "link-in-text-block"]

/**
 * Runs axe over `scope`, the whole page by default, once animations have finished: every rule in the light theme,
 * then the color rules in sepia and dark, then back to light. `skip` leaves rules out and `only` runs just those.
 * What it finds fails the test at its end, so one run lists everything.
 */
function auditor(page: Page) {
  return async (where: string, scope?: string, { skip = [], only }: { skip?: string[]; only?: string[] } = {}) => {
    if (scope) await page.locator(scope).first().waitFor()
    for (const theme of THEMES) {
      const rules = theme === "light" ? only : (only ?? COLOR_RULES).filter((rule) => COLOR_RULES.includes(rule))
      // Legacy mode runs axe in the page alone. By default it opens a blank page each run to merge what it found in
      // each frame: the app has no frames, and that took most of the time.
      let axe = new AxeBuilder({ page }).setLegacyMode()
      if (rules) {
        const run = rules.filter((rule) => !skip.includes(rule))
        if (!run.length) continue
        // A list of rules replaces the tags, and with it axe ignores disableRules, hence the filter.
        axe = axe.withRules(run)
      } else {
        axe = axe.withTags(TAGS).disableRules(skip)
      }
      if (scope) axe = axe.include(scope)
      await page.evaluate((theme) => window.__bbb.setTheme(theme), theme)
      await settle(page)
      const { violations } = await axe.analyze()
      const found = violations.flatMap(({ id, help, nodes }) =>
        nodes.map((node) => `${id} (${help}): ${node.target.join(" ")}`),
      )
      expect.soft(found, `${where} (${theme})`).toEqual([])
    }
    await page.evaluate(() => window.__bbb.setTheme("light"))
  }
}

// Every stop is audited in each of the three themes.
test.describe.configure({ timeout: 180_000 })
// With reduced motion nothing fades (index.css, and Sonner's own CSS), so axe sees each screen as it rests, never a
// toast or a theme halfway through a fade. Once nothing is moving, the app looks the same either way.
test.use({ reducedMotion: "reduce" })

async function closeWith(page: Page, key: string, scope: string) {
  await page.keyboard.press(key)
  await expect(page.locator(scope)).toHaveCount(0)
}

test("the home screen, help and Search pass axe", async ({ page }) => {
  const audit = auditor(page)
  await page.goto("/")
  await page.getByRole("link", { name: "The Salt Ledger" }).waitFor({ timeout: FIRST_LOAD_TIMEOUT })
  await offerInstall(page)
  await page.locator('section[aria-labelledby="install-notice-title"]').waitFor()
  await audit("Home, with the install notice")

  await page.getByRole("button", { name: "New book" }).click()
  await page.getByRole("dialog", { name: "New book" }).getByRole("textbox", { name: "Title" }).waitFor()
  await audit("New book", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await page.getByRole("button", { name: "Backups" }).click()
  await page.getByRole("dialog", { name: "Backups" }).getByRole("region", { name: "This browser" }).waitFor()
  await audit("Backups for every book", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await page.getByRole("button", { name: "Glossary" }).click()
  await page.getByRole("dialog", { name: "Glossary" }).getByRole("searchbox").waitFor()
  await audit("Glossary", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click()
  await page.getByRole("dialog", { name: "Search" }).getByRole("option").first().waitFor()
  await audit("Search", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await page.getByRole("button", { name: "How to use this" }).click()
  await page.getByRole("dialog", { name: "Welcome to bookbookbook" }).getByRole("button", { name: "Next" }).click()
  await page.getByRole("dialog", { name: "Your books" }).waitFor()
  await audit("Tour")
  await closeWith(page, "Escape", "[data-tour-card]")

  await page.goto("/no-such-page")
  await page.getByRole("heading", { level: 1, name: "Page not found" }).waitFor()
  await audit("Page not found")
})

test("the Plan passes axe", async ({ page }) => {
  const audit = auditor(page)
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Plan" }).click()
  const card = page.getByRole("button", { name: "Chapter 2: The Keeper's Room" })
  await card.waitFor()
  await audit("Board")

  await page.getByRole("button", { name: "Display options" }).click()
  await audit("Display menu", "[role=menu]")
  await closeWith(page, "Escape", "[role=menu]")

  await page.getByRole("button", { name: "Filter", exact: true }).click()
  await audit("Filter", "[data-slot=popover-content]")
  await page.getByRole("combobox", { name: "Status" }).click()
  await audit("Status options", "[role=listbox]")
  await closeWith(page, "Escape", "[role=listbox]")
  await closeWith(page, "Escape", "[data-slot=popover-content]")

  await card.click()
  const popout = page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" })
  await popout.waitFor()
  await audit("Chapter pop-out", "[role=dialog]")
  await popout.getByRole("button", { name: /^Point of view\b/ }).click()
  await audit("Point of view picker", "[data-slot=popover-content]")
  await closeWith(page, "Escape", "[data-slot=popover-content]")
  await popout.getByRole("button", { name: /^Story time\b/ }).click()
  await audit("Story time", "[data-slot=popover-content]")
  await closeWith(page, "Escape", "[data-slot=popover-content]")
  await popout.getByRole("button", { name: "More for this chapter" }).click()
  await audit("Chapter menu", "[role=menu]")
  await page.getByRole("menuitem", { name: "Move to Trash" }).click()
  // Pointed at, it waits there through the three audits.
  await page.locator("[data-sonner-toast]").hover()
  await audit("Undo toast", "[data-sonner-toast]")

  const views = page.getByRole("navigation", { name: "Plan views" })
  await views.getByRole("link", { name: "Outline" }).click()
  await page.getByRole("textbox", { name: "Title of chapter 1", exact: true }).waitFor()
  await audit("Outline")
  for (const view of ["Corkboard", "Matrix", "Timeline"]) {
    await views.getByRole("link", { name: view }).click()
    await page.getByRole("heading", { level: 1, name: `Plan: ${view}` }).waitFor({ state: "attached" })
    await audit(view)
  }

  await page.getByRole("navigation", { name: "Plan views" }).getByRole("link", { name: "Matrix" }).click()
  await page.getByRole("button", { name: /^Jonas Quill in chapter 5: / }).click()
  await audit("Matrix cell menu", "[role=menu]")
  await closeWith(page, "Escape", "[role=menu]")

  await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
  await audit("Book menu", "[role=menu]")
  await page.getByRole("menuitem", { name: "Trash…" }).click()
  await page.getByRole("dialog", { name: "Trash" }).getByText("The Keeper's Room").waitFor()
  await audit("Trash", "[role=dialog]")
})

test("Write and its writing aids pass axe", async ({ page }) => {
  const audit = auditor(page)
  await fakeSpeech(page)
  const editor = await openFirstChapter(page)
  await audit("Write")

  const view = (name: string) => page.getByRole("radiogroup", { name: "Write view" }).getByRole("radio", { name })
  await view("Manuscript").click()
  await page.locator("[data-write-chapter]").nth(1).waitFor()
  await audit("Write, the manuscript")
  await view("Scene").click()
  await expect(page.locator("[data-write-chapter]")).toHaveCount(1)
  await audit("Write, a scene")
  await view("Chapter").click()

  await page.getByRole("button", { name: "More for scene 1 in chapter 1" }).click()
  await audit("Scene menu", "[role=menu]")
  await page.getByRole("menuitem", { name: "History" }).click()
  const history = page.getByRole("dialog", { name: "History of “Ferry wake”" })
  await history.getByRole("button", { name: "Take snapshot" }).click()
  await history.getByRole("button", { name: /^Snapshot\b/ }).waitFor()
  await audit("History", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  const moreTools = page.getByRole("button", { name: "More writing tools" })
  await moreTools.click()
  await audit("More writing tools", "[role=menu]")
  await closeWith(page, "Escape", "[role=menu]")
  const fromMenu = async (item: string) => {
    await moreTools.click()
    await page.getByRole("menuitem", { name: item, exact: true }).click()
  }

  await page.getByRole("button", { name: "Chapter plan" }).click()
  await page.getByRole("complementary", { name: "Chapter details" }).waitFor()
  await audit("Write, with the chapter plan")

  await page.getByRole("button", { name: "World", exact: true }).click()
  const world = page.getByRole("complementary", { name: "World" })
  const mara = world.getByRole("region", { name: "In this chapter" }).getByRole("button").first()
  await mara.waitFor()
  await audit("Write, with World")
  await mara.click()
  await world.getByRole("heading", { level: 2, name: "Mara Quill" }).waitFor()
  await audit("Write, with an entry from World")

  await editor.locator(".mention-auto", { hasText: "Mara Quill" }).first().hover()
  await page.getByRole("dialog", { name: "Mara Quill" }).getByRole("button", { name: "Details" }).waitFor()
  await audit("Hover card", "[role=dialog]")
  await page.mouse.move(0, 0)

  await page.getByRole("button", { name: "Find", exact: true }).click()
  await page.getByRole("textbox", { name: "Find", exact: true }).fill("ledger")
  await page.locator("[data-find-result]").first().waitFor()
  await audit("Write, finding")

  await fromMenu("Goals and sprints…")
  const goals = page.getByRole("dialog", { name: "Goals and sprints" })
  await goals.getByRole("textbox", { name: "Daily goal" }).fill("300")
  await goals.getByRole("checkbox", { name: "Show my streak" }).waitFor()
  await audit("Goals and sprints", "[data-slot=popover-content]")
  await goals.getByRole("button", { name: "Start a 15 min sprint" }).click()
  await page.getByRole("button", { name: /^Sprint:/ }).waitFor()
  await audit("Write, with a sprint running")

  await focusEnd(editor)
  await page.keyboard.type(" Wren Harrow waved.")
  await selectText(editor, "Wren Harrow")
  await page.locator("[data-add-to-world]").waitFor()
  await audit("Add to World bubble", "[data-add-to-world]")
  await fromMenu("Add to World…")
  const addToWorld = page.getByRole("dialog", { name: "Add to World" })
  await addToWorld.getByRole("checkbox", { name: "Harrow" }).waitFor()
  await audit("Add to World", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await fromMenu("Read aloud")
  const reading = page.getByRole("region", { name: "Read aloud", exact: true })
  await reading.getByRole("button", { name: "Pause" }).waitFor()
  await audit("Read aloud", "[data-read-aloud-bar]")
  await reading.getByRole("button", { name: "Stop reading" }).click()
  await expect(reading).toBeHidden()

  await page.getByRole("button", { name: "Focus mode" }).click()
  await page.getByRole("button", { name: "Exit focus mode" }).waitFor()
  await focusEnd(editor)
  // Focus mode fades all but the paragraph being written, as the writer asked, so only it is held to the contrast
  // ratio (DESIGN.md §17).
  await audit("Focus mode", undefined, { skip: ["color-contrast"] })
  await audit("Focus mode, the paragraph", ".ProseMirror .has-focus", { only: ["color-contrast"] })
})

test("the AI tools pass axe", async ({ page }) => {
  const audit = auditor(page)
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  await page.getByRole("button", { name: "AI tools", exact: true }).click()
  const panel = page.getByRole("complementary", { name: "AI tools" })
  const setUp = panel.getByRole("button", { name: "Set up AI" })
  await setUp.waitFor()
  await audit("AI tools, before they're set up")

  const settings = page.getByRole("dialog", { name: "AI settings" })
  await setUp.click()
  await settings.getByRole("radio", { name: "OpenAI" }).check()
  await settings.getByLabel("OpenAI API key").fill("sk-test-9999")
  await audit("AI settings for OpenAI", "[role=dialog]")
  await settings.getByRole("radio", { name: "On this computer" }).check()
  await settings.getByRole("button", { name: "Check connection" }).click()
  await expect(settings.locator("[data-ai-check-result]")).toHaveText("Connected. 1 model to choose from.")
  await audit("AI settings for this computer", "[role=dialog]")
  await settings.getByRole("button", { name: "Save", exact: true }).click()
  await expect(settings).toBeHidden()

  await panel.locator("[data-ai-tool]").click()
  await audit("Tools", "[role=listbox]")
  await page.getByRole("option", { name: "Brainstorm", exact: true }).click()
  await panel.getByRole("combobox", { name: "Ideas for" }).click()
  await page.getByRole("option", { name: "Characters", exact: true }).click()
  ai.reply("1. Old Sal: keeps the tide book for the harbor")
  await panel.getByRole("button", { name: "Run Brainstorm" }).click()
  await panel.getByRole("button", { name: "Add to World" }).waitFor()
  await panel.locator("[data-ai-tool]").click()
  await page.getByRole("option", { name: "Continue", exact: true }).click()
  await panel.getByRole("button", { name: "Run Continue" }).click()
  await expect(panel.locator('[data-ai-card-status="done"]')).toHaveCount(2)
  await panel.getByRole("button", { name: "What the AI sees" }).click()
  await panel.getByRole("button", { name: "The whole prompt" }).click()
  await panel.locator('pre[aria-label="The whole prompt"]').waitFor()
  await audit("AI tools, with results")

  await panel.getByRole("button", { name: "Your own tools" }).click()
  const tools = page.getByRole("dialog", { name: "Your own tools" })
  await tools.getByRole("button", { name: "New tool" }).click()
  const form = page.getByRole("dialog", { name: "New tool" })
  await form.getByRole("textbox", { name: "Name" }).fill("Harbor gossip")
  await audit("New tool", "[role=dialog]:has([data-custom-tool-form])")
  await form.getByRole("textbox", { name: "What it asks the AI" }).fill("What does the harbor say?")
  await form.getByRole("button", { name: "Make the tool" }).click()
  await tools.getByRole("button", { name: "Edit" }).waitFor()
  await audit("Your own tools", "[role=dialog]")
})

test("World passes axe", async ({ page }) => {
  const audit = auditor(page)
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
  const agnes = page.locator("[data-codex-row]").filter({ hasText: "Agnes Morrow" })
  await agnes.waitFor()
  await audit("World")

  await page.getByRole("combobox", { name: "Filter by tag" }).click()
  await audit("Tag options", "[role=listbox]")
  await closeWith(page, "Escape", "[role=listbox]")

  await page.getByRole("button", { name: "New type", exact: true }).click()
  await page.getByRole("dialog", { name: "New type" }).waitFor()
  await audit("New type", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await agnes.click()
  const entry = page.locator("[data-codex-entry]")
  await entry.getByRole("heading", { name: "Character: Agnes Morrow" }).waitFor()
  await audit("World entry")
  await entry.getByRole("button", { name: /^Color: / }).click()
  await audit("Color picker", "[data-slot=popover-content]")
  await closeWith(page, "Escape", "[data-slot=popover-content]")
})

test("the Inbox and dictation pass axe", async ({ page }) => {
  const audit = auditor(page)
  await fakeDictation(page)
  await openFirstChapter(page)
  await page.getByRole("button", { name: "Quick note" }).click()
  const quickNote = page.getByRole("dialog", { name: "Quick note" })
  await quickNote.getByRole("textbox", { name: "Quick note" }).fill("Thomas kept a second ledger.")
  await audit("Quick note", "[role=dialog]")
  await quickNote.getByRole("button", { name: "Save to Inbox" }).click()
  const saved = page.locator("[data-sonner-toast]").filter({ hasText: "Saved to the Inbox." })
  await saved.getByRole("button", { name: "Show" }).click()
  await page.getByRole("heading", { level: 1, name: "Inbox" }).waitFor()
  await audit("Inbox")

  const note = page.locator("[data-inbox-note]").first()
  await note.getByRole("button", { name: /^File / }).click()
  const file = page.getByRole("dialog", { name: "File this note" })
  await file.getByRole("combobox", { name: "Where" }).click()
  await page.getByRole("option", { name: "Chapter 1: The Ferry Home", exact: true }).click()
  await file.getByRole("radio", { name: "Moments" }).waitFor()
  await audit("File this note", "[role=dialog]")
  await file.getByRole("button", { name: "File note" }).click()
  await page.locator('[data-inbox-list="filed"]').click()
  await page.locator("[data-inbox-filed]").first().waitFor()
  await audit("Inbox, filed")

  await page.locator('[data-dictate="inbox-capture"]').click()
  const setup = page.getByRole("dialog", { name: "Set up dictation" })
  await setup.locator('[data-dictation-status="available"]').waitFor()
  await audit("Set up dictation", "[role=dialog]")
  await setup.getByRole("button", { name: "Start dictating" }).click()
  await page.getByRole("region", { name: "Dictation", exact: true }).getByRole("button", { name: "Stop" }).waitFor()
  await audit("Dictating")
})

test("the book's dialogs pass axe", async ({ page }) => {
  const audit = auditor(page)
  await openFirstChapter(page)
  await seedBackupRecord(page, { last: 20, changed: 10 })
  await page.reload()
  await page.getByRole("region", { name: "Backup reminder" }).getByRole("button", { name: "Not now" }).waitFor()
  await audit("Backup reminder", 'section[aria-label="Backup reminder"]')

  const bookMenu = async (item: RegExp) => {
    await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
    await page.getByRole("menuitem", { name: item }).click()
  }

  await bookMenu(/^Backups…/)
  await page.getByRole("dialog", { name: "Backups" }).getByText(/^The browser /).first().waitFor()
  await audit("Backups", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await bookMenu(/^Export…/)
  await page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: "Export" }).waitFor()
  await audit("Export", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await bookMenu(/^Book settings…/)
  await page.getByRole("dialog").getByRole("textbox").first().waitFor()
  await audit("Book settings", "[role=dialog]")
  await closeWith(page, "Escape", "[role=dialog]")

  await bookMenu(/^Import a manuscript…/)
  const dialog = page.getByRole("dialog", { name: "Import a manuscript" })
  await dialog.getByRole("button", { name: /^Choose a file…/ }).waitFor()
  await audit("Import a manuscript", "[role=dialog]")
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "draft.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# The Long Tide\n\nby Ada Lane\n\n# Part One\n\n## Ferry\n\nThe ferry.\n\n* * *\n\nNight.\n\n" +
        "## Harbour\n\nGulls.\n\n# Part Two\n\n## Island\n\nFog.\n",
    ),
  })
  await dialog.getByRole("textbox", { name: "Title of act 2" }).waitFor()
  await audit("Import preview", "[role=dialog]")
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

  test("Write, the Plan and World pass axe", async ({ page }) => {
    const audit = auditor(page)
    await fakeKeyboard(page)
    const editor = await openFirstChapter(page)
    await audit("Write on a phone")

    const moreTools = page.getByRole("button", { name: "More writing tools" })
    await moreTools.click()
    await audit("Writing tools menu on a phone", "[role=menu]")
    await page.getByRole("menuitem", { name: "World", exact: true }).click()
    await page.getByRole("dialog", { name: "World" }).getByRole("region", { name: "In this chapter" }).waitFor()
    await audit("World panel on a phone", "[role=dialog]")
    await closeWith(page, "Escape", "[role=dialog]")

    await focusEnd(editor)
    await page.evaluate(() => window.__keyboard(300))
    await page.getByRole("toolbar", { name: "Writing tools" }).waitFor()
    await audit("Tools above the keyboard", "[data-docked-tools]")
    await page.evaluate(() => window.__keyboard(0))

    await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Plan" }).click()
    const card = page.getByRole("button", { name: "Chapter 2: The Keeper's Room" })
    await card.waitFor()
    await audit("Board on a phone")
    await card.click()
    await page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" }).waitFor()
    await audit("Chapter pop-out on a phone", "[role=dialog]")
    await closeWith(page, "Escape", "[role=dialog]")

    await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
    await page.locator("[data-codex-row]").filter({ hasText: "Agnes Morrow" }).waitFor()
    await audit("World on a phone")
    await page.getByRole("combobox", { name: "Entry type" }).click()
    await audit("Entry types on a phone", "[role=listbox]")
  })
})
