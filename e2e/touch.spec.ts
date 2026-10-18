import { expect, type Page } from "@playwright/test"
import { FIRST_LOAD_TIMEOUT, openFirstChapter, seedBackupRecord, test } from "./fixtures"

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
 * absolute ::after that stretches it, as checkboxes, label chips and Board cards use.
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
        await page.getByRole("menuitem", { name: "World" }).click()
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
  })
}
