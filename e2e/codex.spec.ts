import type { Page } from "@playwright/test"
import { expect, flushAll, focusEnd, openFirstChapter, queryDb, test } from "./fixtures"

/** Opens World from the header. On wide screens the first character, Agnes Morrow, opens with it. */
async function openWorld(page: Page) {
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "World" })).toBeAttached()
}

/** An entry's row in the list: a link named by the entry's name, then its aliases. */
const row = (page: Page, name: string) =>
  page.locator("[data-codex-row]").filter({ has: page.getByText(name, { exact: true }) })

/** The open entry's heading, which reads "Character: Agnes Morrow". */
const entryHeading = (page: Page, name: string) => page.getByRole("heading", { level: 2, name, exact: true })

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })

test.describe("World", () => {
  test("a new character keeps its name, aliases and fields after a reload", async ({ page }) => {
    await openWorld(page)
    await page.getByRole("button", { name: "New character" }).click()
    const name = page.getByRole("textbox", { name: "Name" })
    await expect(name).toBeFocused()
    await name.fill("Ada Thorn")

    const aliases = page.getByRole("textbox", { name: "Aliases" })
    await aliases.fill("Ada")
    await aliases.press("Enter")
    await expect(page.getByRole("button", { name: "Remove alias Ada" })).toBeVisible()

    const newField = page.getByRole("textbox", { name: "New field" })
    await newField.fill("Ship")
    await newField.press("Enter")
    const ship = page.getByRole("textbox", { name: "Ship", exact: true })
    await expect(ship).toBeFocused()
    await ship.fill("The Gannet")
    await ship.press("Tab")

    await expect(row(page, "Ada Thorn")).toContainText("Ada")
    const saved = async () => {
      const [entry] = await queryDb<{ aliases: string; fields: string }>(
        page,
        "SELECT aliases, fields FROM codex_entries WHERE name = ?",
        ["Ada Thorn"],
      )
      if (!entry) return null
      const fields = JSON.parse(entry.fields) as Record<string, string>
      return { aliases: JSON.parse(entry.aliases) as unknown, ship: fields.Ship }
    }
    await expect.poll(saved).toEqual({ aliases: ["Ada"], ship: "The Gannet" })

    await page.reload()
    // Arriving at an entry selects its row (DESIGN.md §17).
    await expect(row(page, "Ada Thorn")).toBeFocused()
    await expect(entryHeading(page, "Character: Ada Thorn")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Ada Thorn")
    await expect(page.getByRole("button", { name: "Remove alias Ada" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Ship", exact: true })).toHaveValue("The Gannet")
  })

  test("Appears in opens the chapter, and Back returns to the entry's row", async ({ page }) => {
    await openWorld(page)
    await expect(entryHeading(page, "Character: Agnes Morrow")).toBeVisible()
    await page.getByRole("link", { name: /^Chapter 2: The Keeper's Room\b/ }).click()
    await expect(page.getByRole("heading", { level: 1, name: "The Keeper's Room" })).toBeFocused()

    await page.goBack()
    await expect(entryHeading(page, "Character: Agnes Morrow")).toBeVisible()
    await expect(row(page, "Agnes Morrow")).toBeFocused()
  })

  test("an entry moved to the Trash comes back with Undo, or from the book menu", async ({ page }) => {
    await openWorld(page)
    await row(page, "Elias Penhallow").click()
    await expect(entryHeading(page, "Character: Elias Penhallow")).toBeVisible()
    await page.getByRole("button", { name: "More for this entry" }).click()
    await page.getByRole("menuitem", { name: "Move to Trash" }).click()

    // The next one opens in its place.
    const moved = toast(page, "Moved “Elias Penhallow” to the Trash")
    await expect(moved).toBeVisible()
    await expect(entryHeading(page, "Character: Jonas Quill")).toBeVisible()
    await expect(row(page, "Jonas Quill")).toBeFocused()
    await expect(row(page, "Elias Penhallow")).toHaveCount(0)

    await moved.getByRole("button", { name: "Undo" }).click()
    await expect(entryHeading(page, "Character: Elias Penhallow")).toBeVisible()
    await expect(row(page, "Elias Penhallow")).toBeFocused()
    // The toast going doesn't take focus back to where it was before.
    await expect(moved).toHaveCount(0)
    await expect(row(page, "Elias Penhallow")).toBeFocused()

    await page.getByRole("button", { name: "More for this entry" }).click()
    await page.getByRole("menuitem", { name: "Move to Trash" }).click()
    await expect(row(page, "Elias Penhallow")).toHaveCount(0)
    await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
    await page.getByRole("menuitem", { name: "Trash…" }).click()
    const trash = page.getByRole("dialog", { name: "Trash" })
    await trash.getByRole("button", { name: "Restore Elias Penhallow" }).click()
    await expect(toast(page, "Restored “Elias Penhallow”")).toBeVisible()
    await expect(trash.getByText("The Trash is empty.")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(row(page, "Elias Penhallow")).toBeVisible()
  })

  test("a type of your own can be named, renamed, and deleted while it's empty", async ({ page }) => {
    await openWorld(page)
    const types = page.getByRole("navigation", { name: "Entry types" })
    await page.getByRole("button", { name: "New type" }).click()
    const dialog = page.getByRole("dialog", { name: "New type" })
    const name = dialog.getByRole("textbox", { name: "Name" })
    await expect(name).toBeFocused()
    await name.fill("characters")
    await dialog.getByRole("button", { name: "Create type" }).click()
    await expect(dialog.getByText("There's a type called “Characters” already.")).toBeVisible()
    await expect(name).toHaveAttribute("aria-invalid", "true")

    await name.fill("Ships")
    await dialog.getByRole("button", { name: "Create type" }).click()
    await expect(dialog).toBeHidden()
    await expect(types.getByRole("button", { name: "Ships, 0 entries" })).toHaveAttribute("aria-current", "true")
    await expect(page.getByRole("heading", { name: "No ships yet" })).toBeVisible()
    await expect(page.locator("[data-codex-new]")).toBeFocused()

    await page.getByRole("button", { name: "More for Ships" }).click()
    await page.getByRole("menuitem", { name: "Rename “Ships”…" }).click()
    const rename = page.getByRole("dialog", { name: "Rename type" })
    await rename.getByRole("textbox", { name: "Name" }).fill("Vessels")
    await rename.getByRole("button", { name: "Rename" }).click()
    await expect(rename).toBeHidden()
    await expect(page.getByRole("button", { name: "More for Vessels" })).toBeFocused()
    const vessels = types.getByRole("button", { name: "Vessels, 0 entries" })
    await expect(vessels).toBeVisible()

    await page.getByRole("button", { name: "More for Vessels" }).click()
    await page.getByRole("menuitem", { name: "Delete “Vessels”" }).click()
    await expect(vessels).toHaveCount(0)
    await expect(types.getByRole("button", { name: /^Characters,/ })).toBeFocused()

    // Undo brings the type back, and shows it again.
    await toast(page, "Deleted the type “Vessels”").getByRole("button", { name: "Undo" }).click()
    await expect(vessels).toBeFocused()
    await expect(vessels).toHaveAttribute("aria-current", "true")
    await expect(page.getByRole("heading", { name: "No vessels yet" })).toBeVisible()
  })

  test("a field added to every character shows on each, and removing it can be undone", async ({ page }) => {
    await openWorld(page)
    await expect(entryHeading(page, "Character: Agnes Morrow")).toBeVisible()
    await page.getByRole("textbox", { name: "New field" }).fill("Birthplace")
    await page.getByRole("checkbox", { name: "Add to every character" }).check()
    await page.getByRole("button", { name: "Add field" }).click()
    const birthplace = page.getByRole("textbox", { name: "Birthplace" })
    await expect(birthplace).toBeFocused()
    await birthplace.fill("Grayhaven")
    await birthplace.press("Tab")

    await row(page, "Mara Quill").click()
    await expect(entryHeading(page, "Character: Mara Quill")).toBeVisible()
    await expect(birthplace).toHaveValue("")
    await page.getByRole("button", { name: "Remove “Birthplace” from Characters" }).click()
    // Agnes filled it in, so she keeps hers.
    const removed = toast(page, "Removed “Birthplace” from Characters, except 1 that filled it in")
    await expect(removed).toBeVisible()
    await expect(birthplace).toHaveCount(0)

    await removed.getByRole("button", { name: "Undo" }).click()
    await expect(birthplace).toBeFocused()

    await row(page, "Agnes Morrow").click()
    await expect(entryHeading(page, "Character: Agnes Morrow")).toBeVisible()
    await expect(birthplace).toHaveValue("Grayhaven")
    await expect(page.getByRole("button", { name: "Remove “Birthplace” from Characters" })).toBeAttached()
  })

  test("search looks through every type, and a tag narrows what it finds", async ({ page }) => {
    await openWorld(page)
    const search = page.getByRole("searchbox", { name: "Search your world" })
    await search.fill("quill")
    const results = page.getByRole("list", { name: "Search results" })
    // Three by name; the Lighthouse, the Salt Ledger and the Brass Key by what their fields say.
    await expect(results.getByRole("link")).toHaveCount(6)
    await expect(row(page, "the Brass Key")).toContainText("Object · brass key")
    const found = page.getByRole("status").filter({ hasText: "found" })
    await expect(found).toHaveText("6 entries found")

    await page.getByRole("combobox", { name: "Filter by tag" }).click()
    await page.getByRole("option", { name: "clue" }).click()
    await expect(results.getByRole("link")).toHaveCount(1)
    await expect(row(page, "the Brass Key")).toBeVisible()
    await expect(found).toHaveText("1 entry found")

    await search.fill("zzz")
    await expect(page.getByText("No entries match.")).toBeVisible()
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(search).toBeFocused()
    await expect(search).toHaveValue("")
    await expect(page.getByRole("combobox", { name: "Filter by tag" })).toHaveText("All tags")
    await expect(page.getByRole("list", { name: "Characters" }).getByRole("link")).toHaveCount(5)
  })

  test("a new character is found in the text, and Appears in counts it", async ({ page }) => {
    const editor = await openFirstChapter(page)
    await focusEnd(editor)
    await page.keyboard.type(" Zephyr Lane waved from the quay.")
    await flushAll(page)

    await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
    await page.getByRole("button", { name: "New character" }).click()
    // Once it's open: until then the Name box is Agnes Morrow's.
    const name = page.getByRole("textbox", { name: "Name" })
    await expect(name).toBeFocused()
    await name.fill("Zephyr Lane")
    const appearance = page.getByRole("link", { name: "Chapter 1: The Ferry Home, 1 mention" })
    await expect(appearance).toBeVisible()

    await appearance.click()
    await expect(page.getByRole("heading", { level: 1, name: "The Ferry Home" })).toBeFocused()
    await expect(page.locator(".mention-auto").filter({ hasText: "Zephyr Lane" })).toBeVisible()
  })
})

test.describe("World on a phone", () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test("the list and an entry take turns, and Back returns to the entry's row", async ({ page }) => {
    await openWorld(page)
    await expect(page.getByRole("list", { name: "Characters" })).toBeVisible()
    await expect(page.locator("[data-codex-entry]")).toHaveCount(0)

    await row(page, "Mara Quill").click()
    await expect(entryHeading(page, "Character: Mara Quill")).toBeFocused()
    await expect(page.getByRole("list", { name: "Characters" })).toHaveCount(0)

    await page.getByRole("link", { name: "Characters", exact: true }).click()
    await expect(row(page, "Mara Quill")).toBeFocused()
  })
})
