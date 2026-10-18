import { expect, type Page } from "@playwright/test"
import {
  fakeAi,
  fakeDictation,
  fakeSpeech,
  FIRST_LOAD_TIMEOUT,
  focusEnd,
  LOCAL_AI,
  openFirstChapter,
  seedBackupRecord,
  selectText,
  test,
} from "./fixtures"

const CONTROLS = [
  "button",
  "a[href]",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  '[contenteditable="true"]',
  ...["checkbox", "radio", "option", "menuitem", "menuitemcheckbox", "menuitemradio"].map((role) => `[role="${role}"]`),
].join(", ")

/** Lets open and close animations finish, so nothing is measured mid-zoom. Endless ones (spinners) don't count. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running" || animation.effect?.getComputedTiming().endTime === Infinity),
  )
}

/**
 * Visible controls in `scope` whose hit area is under 44px either way (DESIGN.md §16). The hit area includes an
 * absolute ::after that stretches it, as checkboxes, label chips and Board cards use, and a label wrapped around it,
 * which takes its taps, as the radio cards in AI settings do.
 */
async function smallTargets(page: Page, scope: string) {
  await page.locator(scope).first().waitFor()
  await settle(page)
  return page.evaluate(
    ({ scope, controls }) => {
      const hitArea = (element: HTMLElement) => {
        let { left, top, right, bottom } = element.getBoundingClientRect()
        const after = getComputedStyle(element, "::after")
        // An absolute ::after sits against the padding box of the element, or of its positioned ancestor.
        const block = getComputedStyle(element).position === "static" ? (element.offsetParent as HTMLElement | null) : element
        const [t, r, b, l] = [after.top, after.right, after.bottom, after.left].map(parseFloat)
        if (after.content !== "none" && after.position === "absolute" && block && ![t, r, b, l].some(Number.isNaN)) {
          const box = block.getBoundingClientRect()
          const x = box.left + block.clientLeft
          const y = box.top + block.clientTop
          left = Math.min(left, x + l)
          top = Math.min(top, y + t)
          right = Math.max(right, x + block.clientWidth - r)
          bottom = Math.max(bottom, y + block.clientHeight - b)
        }
        const label = element.closest("label")?.getBoundingClientRect()
        if (label) {
          left = Math.min(left, label.left)
          top = Math.min(top, label.top)
          right = Math.max(right, label.right)
          bottom = Math.max(bottom, label.bottom)
        }
        return { width: right - left, height: bottom - top }
      }

      const small: string[] = []
      for (const element of document.querySelector(scope)!.querySelectorAll<HTMLElement>(controls)) {
        const shown = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (!shown.width || !shown.height || style.visibility === "hidden" || style.opacity === "0") continue
        // Inert behind a modal, or a Radix form mirror.
        if (element.closest("[aria-hidden='true'], .sr-only")) continue
        // Dev-only tools.
        if (element.matches('a[href^="/lab/"]')) continue
        const { width, height } = hitArea(element)
        if (width >= 43.5 && height >= 43.5) continue
        const name =
          element.getAttribute("aria-label") ||
          element.getAttribute("placeholder") ||
          element.textContent?.trim().slice(0, 40) ||
          element.tagName
        small.push(`${name} (${Math.round(width)}×${Math.round(height)})`)
      }
      return small
    },
    { scope, controls: CONTROLS },
  )
}

/** Checks for small targets, and closes what a check opened. */
function checker(page: Page) {
  return {
    check: async (where: string, scope = "body") => expect(await smallTargets(page, scope), where).toEqual([]),
    closeWith: async (key: string, scope: string) => {
      await page.keyboard.press(key)
      await expect(page.locator(scope)).toHaveCount(0)
    },
  }
}

for (const [device, viewport] of [
  ["phone", { width: 412, height: 915 }],
  ["tablet", { width: 900, height: 1200 }],
] as const) {
  test.describe(`on a ${device} touch screen`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    test("every control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)

      await openFirstChapter(page)
      await check("Write")

      if (device === "phone") {
        await page.getByRole("button", { name: "More writing tools" }).click()
        await check("Writing tools menu", "[role=menu]")
        await closeWith("Escape", "[role=menu]")
      }

      await page.getByRole("button", { name: "More for scene 1 in chapter 1" }).click()
      await check("Scene menu", "[role=menu]")
      await page.getByRole("menuitem", { name: "History" }).click()
      const history = page.getByRole("dialog", { name: "History of “Ferry wake”" })
      await history.getByRole("button", { name: "Take snapshot" }).click()
      await history.getByRole("button", { name: /^Snapshot\b/ }).waitFor()
      await check("History", "[role=dialog]")
      await closeWith("Escape", "[role=dialog]")

      if (device === "phone") {
        await page.getByRole("button", { name: "More writing tools" }).click()
        await page.getByRole("menuitem", { name: "Chapter plan" }).click()
      } else {
        await page.getByRole("button", { name: "Chapter plan" }).click()
      }
      await page.getByRole("dialog", { name: "Chapter 1: The Ferry Home" }).waitFor()
      await check("Chapter plan", "[role=dialog]")
      await closeWith("Escape", "[role=dialog]")

      if (device === "phone") {
        await page.getByRole("button", { name: "More writing tools" }).click()
        await page.getByRole("menuitem", { name: "World", exact: true }).click()
      } else {
        await page.getByRole("button", { name: "World", exact: true }).click()
      }
      const worldSheet = page.getByRole("dialog", { name: "World" })
      const mara = worldSheet.getByRole("region", { name: "In this chapter" }).getByRole("button").first()
      await mara.waitFor()
      await check("World panel", "[role=dialog]")
      await mara.click()
      await worldSheet.getByRole("heading", { level: 2, name: "Mara Quill" }).waitFor()
      await check("World panel entry", "[role=dialog]")
      await closeWith("Escape", "[role=dialog]")

      await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Plan" }).click()
      const card = page.getByRole("button", { name: "Chapter 2: The Keeper's Room" })
      await card.waitFor()
      await check("Board")

      await page.getByRole("button", { name: "Display options" }).click()
      await check("Display menu", "[role=menu]")
      await closeWith("Escape", "[role=menu]")

      // The popover first: an open Select hides everything else from assistive tech, and from this check.
      await page.getByRole("button", { name: "Filter", exact: true }).click()
      await check("Filter popover", "[data-slot=popover-content]")
      await page.getByRole("combobox", { name: "Status" }).click()
      await check("Status options", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")
      await closeWith("Escape", "[data-slot=popover-content]")

      await page.getByRole("button", { name: /^More for ACT I\b/ }).click()
      await check("Act menu", "[role=menu]")
      await closeWith("Escape", "[role=menu]")

      await card.click()
      const sheet = page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" })
      await sheet.waitFor()
      await check("Chapter details", "[role=dialog]")

      await sheet.getByRole("button", { name: /^Point of view\b/ }).click()
      await check("Point of view picker", "[data-slot=popover-content]")
      await closeWith("Escape", "[data-slot=popover-content]")

      await sheet.getByRole("button", { name: /^Story time\b/ }).click()
      await check("Story time", "[data-slot=popover-content]")
      await closeWith("Escape", "[data-slot=popover-content]")

      await sheet.getByRole("button", { name: "More for this chapter" }).click()
      await check("Chapter menu", "[role=menu]")
      await page.getByRole("menuitem", { name: "Move to Trash" }).click()
      await check("Undo toast", "[data-sonner-toast]")

      await page.getByRole("navigation", { name: "Plan views" }).getByRole("link", { name: "Outline" }).click()
      await page.getByRole("textbox", { name: "Title of chapter 1", exact: true }).waitFor()
      await check("Outline")
    })

    test("every writing aid's control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)
      await fakeSpeech(page)

      const editor = await openFirstChapter(page)
      const moreTools = page.getByRole("button", { name: "More writing tools" })
      const fromMenu = async (item: string) => {
        await moreTools.click()
        await page.getByRole("menuitem", { name: item, exact: true }).click()
      }
      if (device === "tablet") {
        await moreTools.click()
        await check("More writing tools", "[role=menu]")
        await closeWith("Escape", "[role=menu]")
      }

      // With a daily goal, so the streak's checkbox shows.
      await fromMenu("Goals and sprints…")
      const goals = page.getByRole("dialog", { name: "Goals and sprints" })
      await goals.getByRole("textbox", { name: "Daily goal" }).fill("300")
      await goals.getByRole("checkbox", { name: "Show my streak" }).waitFor()
      await check("Goals and sprints", "[data-slot=popover-content]")
      await goals.getByRole("button", { name: "Start a 15-minute sprint" }).click()
      const clock = page.getByRole("button", { name: /^Sprint:/ })
      await clock.waitFor()
      await check("Write, with a sprint running")
      await clock.click()
      await goals.getByRole("button", { name: "Stop sprint" }).waitFor()
      await check("Running sprint", "[data-slot=popover-content]")
      await goals.getByRole("button", { name: "Stop sprint" }).click()
      await closeWith("Escape", "[data-slot=popover-content]")

      if (device === "phone") await fromMenu("Find and replace")
      else await page.getByRole("button", { name: "Find", exact: true }).click()
      const find = page.getByRole("dialog", { name: "Find and replace" })
      await find.getByRole("textbox", { name: "Find", exact: true }).fill("ledger")
      await find.locator("[data-find-result]").first().waitFor()
      await check("Find and replace", "[role=dialog]")
      await closeWith("Escape", "[role=dialog]")

      // A name of two words, so the shorter names it might go by are on offer.
      await focusEnd(editor)
      await page.keyboard.type(" Wren Harrow waved.")
      await selectText(editor, "Wren Harrow")
      await fromMenu("Add to World…")
      const addToWorld = page.getByRole("dialog", { name: "Add to World" })
      await addToWorld.getByRole("checkbox", { name: "Harrow" }).waitFor()
      await check("Add to World", "[role=dialog]")
      await addToWorld.getByRole("combobox", { name: "Type" }).click()
      await check("Add to World type options", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")
      await closeWith("Escape", "[role=dialog]")

      await fromMenu("Read aloud")
      const reading = page.getByRole("region", { name: "Read aloud", exact: true })
      await reading.getByRole("button", { name: "Pause" }).waitFor()
      await check("Read aloud", "[data-read-aloud-bar]")
      for (const name of ["Speed", "Voice"]) {
        await reading.getByRole("combobox", { name }).click()
        await check(`${name} options`, "[role=listbox]")
        await closeWith("Escape", "[role=listbox]")
      }
      await reading.getByRole("button", { name: "Stop reading" }).click()
      await expect(reading).toBeHidden()

      if (device === "phone") await fromMenu("Focus mode")
      else await page.getByRole("button", { name: "Focus mode" }).click()
      await page.getByRole("button", { name: "Exit focus mode" }).waitFor()
      await check("Focus mode")
    })

    test("every World control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)

      await openFirstChapter(page)
      await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
      const agnes = page.locator("[data-codex-row]").filter({ hasText: "Agnes Morrow" })
      await agnes.waitFor()
      await check("World")

      await page.getByRole("combobox", { name: "Entry type" }).click()
      await check("Type options", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")

      await page.getByRole("combobox", { name: "Filter by tag" }).click()
      await check("Tag options", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")

      await page.getByRole("button", { name: "More for types" }).click()
      await check("Types menu", "[role=menu]")
      await page.getByRole("menuitem", { name: "New type…" }).click()
      await page.getByRole("dialog", { name: "New type" }).waitFor()
      await check("New type", "[role=dialog]")
      await closeWith("Escape", "[role=dialog]")

      // On the tablet she's open already.
      await agnes.click()
      const entry = page.locator("[data-codex-entry]")
      await entry.getByRole("heading", { name: "Character: Agnes Morrow" }).waitFor()
      await check("World entry")

      await entry.getByRole("combobox", { name: "Type", exact: true }).click()
      await check("Entry type options", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")

      await entry.getByRole("button", { name: /^Color: / }).click()
      await check("Color picker", "[data-slot=popover-content]")
      await closeWith("Escape", "[data-slot=popover-content]")

      await entry.getByRole("button", { name: "More for this entry" }).click()
      await check("Entry menu", "[role=menu]")
      await page.getByRole("menuitem", { name: "Move to Trash" }).click()
      await check("Undo toast", "[data-sonner-toast]")
    })

    test("every home and help control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)

      await page.goto("/")
      await page.getByRole("link", { name: "The Salt Ledger" }).waitFor({ timeout: FIRST_LOAD_TIMEOUT })
      await check("Home")

      const openHelp = async (item: "How to use this" | "Glossary") => {
        if (device === "phone") {
          await page.getByRole("button", { name: "Help" }).click()
          await check("Help menu", "[role=menu]")
          await page.getByRole("menuitem", { name: item }).click()
        } else {
          await page.getByRole("button", { name: item }).click()
        }
      }

      await openHelp("Glossary")
      await page.getByRole("dialog", { name: "Glossary" }).getByRole("searchbox").waitFor()
      await check("Glossary", "[role=dialog]")
      await closeWith("Escape", "[role=dialog]")

      // The second step offers to explain a word, so it has every kind of button a tour card has.
      await openHelp("How to use this")
      await page.getByRole("dialog", { name: "Welcome to bookbookbook" }).getByRole("button", { name: "Next" }).click()
      await page.getByRole("dialog", { name: "Your books" }).waitFor()
      await check("Tour card", "[data-tour-card]")
      await closeWith("Escape", "[data-tour-card]")
    })

    test("every import control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)

      await openFirstChapter(page)
      await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
      await check("Book menu", "[role=menu]")
      await page.getByRole("menuitem", { name: "Import a manuscript…" }).click()
      const dialog = page.getByRole("dialog", { name: "Import a manuscript" })
      await dialog.getByRole("button", { name: /^Choose a file…/ }).waitFor()
      await check("Import a manuscript", "[role=dialog]")

      // Acts, scenes and a left-out title page: every kind of row.
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "draft.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          "# The Long Tide\n\nby Ada Lane\n\n# Part One\n\n## Ferry\n\nThe ferry.\n\n* * *\n\nNight.\n\n" +
            "## Harbour\n\nGulls.\n\n# Part Two\n\n## Island\n\nFog.\n",
        ),
      })
      await dialog.getByRole("textbox", { name: "Title of act 2" }).waitFor()
      await check("Import preview", "[role=dialog]")

      await dialog.getByRole("combobox", { name: "Chapters start at" }).click()
      await check("Chapter start options", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")

      await dialog.getByRole("button", { name: "More for chapter 2" }).click()
      await check("Import chapter menu", "[role=menu]")
      await closeWith("Escape", "[role=menu]")
    })

    test("every backup control is at least a 44px target", async ({ page }) => {
      const { check } = checker(page)

      await openFirstChapter(page)
      await seedBackupRecord(page, { last: 20, changed: 10 })
      await page.reload()
      const reminder = page.getByRole("region", { name: "Backup reminder" })
      await reminder.getByRole("button", { name: "Not now" }).waitFor()
      await check("Backup reminder", 'section[aria-label="Backup reminder"]')

      await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
      await page.getByRole("menuitem", { name: /^Backups…/ }).click()
      const dialog = page.getByRole("dialog", { name: "Backups" })
      await dialog.getByRole("region", { name: "This browser" }).getByText(/^The browser /).first().waitFor()
      await check("Backups", "[role=dialog]")
    })

    test("every Inbox and dictation control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)
      await fakeDictation(page)

      await openFirstChapter(page)
      await page.getByRole("button", { name: "Quick note" }).click()
      const quickNote = page.getByRole("dialog", { name: "Quick note" })
      await quickNote.getByRole("textbox", { name: "Quick note" }).fill("Thomas kept a second ledger.")
      await check("Quick note", "[role=dialog]")
      await quickNote.getByRole("button", { name: "Save to Inbox" }).click()
      const saved = page.locator("[data-sonner-toast]").filter({ hasText: "Saved to the Inbox." })
      await check("Saved toast", "[data-sonner-toast]")
      await saved.getByRole("button", { name: "Show" }).click()
      await page.getByRole("heading", { level: 1, name: "Inbox" }).waitFor()
      await check("Inbox")

      const note = page.locator("[data-inbox-note]").first()
      await note.getByRole("button", { name: /^More for / }).click()
      await check("Note menu", "[role=menu]")
      await closeWith("Escape", "[role=menu]")

      await note.getByRole("button", { name: /^File / }).click()
      const file = page.getByRole("dialog", { name: "File this note" })
      await file.getByRole("combobox", { name: "Where" }).click()
      await check("Where options", "[role=listbox]")
      await page.getByRole("option", { name: "Chapter 1: The Ferry Home", exact: true }).click()
      await file.getByRole("radio", { name: "Moments" }).waitFor()
      await check("File this note", "[role=dialog]")
      await file.getByRole("button", { name: "File note" }).click()
      await check("Filed toast", "[data-sonner-toast]")
      await page.locator('[data-inbox-list="filed"]').click()
      await page.locator("[data-inbox-filed]").first().waitFor()
      await check("Filed")

      await page.locator('[data-dictate="inbox-capture"]').click()
      const setup = page.getByRole("dialog", { name: "Set up dictation" })
      await setup.locator('[data-dictation-status="available"]').waitFor()
      await check("Set up dictation", "[role=dialog]")
      await setup.getByRole("combobox", { name: "Language you'll speak" }).click()
      await check("Languages", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")
      await setup.getByRole("button", { name: "Start dictating" }).click()
      await page.getByRole("region", { name: "Dictation", exact: true }).getByRole("button", { name: "Stop" }).waitFor()
      await check("Dictation", 'section[aria-label="Dictation"]')
    })

    test("every AI control is at least a 44px target", async ({ page }) => {
      const { check, closeWith } = checker(page)
      const ai = await fakeAi(page, LOCAL_AI)

      const editor = await openFirstChapter(page)
      await focusEnd(editor)
      if (device === "phone") {
        await page.getByRole("button", { name: "More writing tools" }).click()
        await page.getByRole("menuitem", { name: "AI tools" }).click()
      } else {
        await page.getByRole("button", { name: "AI tools", exact: true }).click()
      }
      const panel = page.getByRole("dialog", { name: "AI tools" })
      const setUp = panel.getByRole("button", { name: "Set up AI" })
      await setUp.waitFor()
      await check("AI tools, before they're set up", "[role=dialog]")

      // For OpenAI with a key saved, then for a model on this computer, its connection checked.
      const settings = page.getByRole("dialog", { name: "AI settings" })
      const inSettings = "[role=dialog]:has([data-ai-settings])"
      await setUp.click()
      await settings.getByRole("radio", { name: "OpenAI" }).check()
      await settings.getByLabel("OpenAI API key").fill("sk-test-9999")
      await settings.getByRole("button", { name: "Save", exact: true }).click()
      await expect(settings).toBeHidden()
      await panel.getByRole("button", { name: "AI settings", exact: true }).click()
      await expect(settings).toContainText("Saved key: ••••9999")
      await check("AI settings for OpenAI", inSettings)
      await settings.getByRole("combobox", { name: "How much it can read" }).click()
      await check("Sizes", "[role=listbox]")
      await closeWith("Escape", "[role=listbox]")
      await settings.getByRole("radio", { name: "On this computer" }).check()
      await settings.getByRole("button", { name: "Check connection" }).click()
      await expect(settings.locator("[data-ai-check-result]")).toHaveText("Connected. 1 model to choose from.")
      await check("AI settings for this computer", inSettings)
      await settings.getByRole("button", { name: "Save", exact: true }).click()
      await expect(settings).toBeHidden()

      // Brainstorm's characters have every kind of idea button; Continue's versions, every kind of version button.
      await panel.locator("[data-ai-tool]").click()
      await check("Tools", "[role=listbox]")
      await page.getByRole("option", { name: "Brainstorm", exact: true }).click()
      await panel.getByRole("combobox", { name: "Ideas for" }).click()
      await check("Ideas for", "[role=listbox]")
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
      await check("AI tools, with results", "[role=dialog]")

      await panel.getByRole("button", { name: "Your own tools" }).click()
      const tools = page.getByRole("dialog", { name: "Your own tools" })
      await tools.getByRole("button", { name: "New tool" }).click()
      const form = page.getByRole("dialog", { name: "New tool" })
      await form.getByRole("textbox", { name: "Name" }).fill("Harbor gossip")
      await check("New tool", "[role=dialog]:has([data-custom-tool-form])")
      await form.getByRole("textbox", { name: "What it asks the AI" }).fill("What does the harbor say?")
      await form.getByRole("button", { name: "Make the tool" }).click()
      await tools.getByRole("button", { name: "Edit" }).waitFor()
      await check("Your own tools", "[role=dialog]:has([data-custom-tool-new])")
    })
  })
}
