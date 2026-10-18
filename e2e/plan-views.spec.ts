import { readFile } from "node:fs/promises"
import type { Page } from "@playwright/test"
import { expect, FIRST_LOAD_TIMEOUT, openBookId, openFirstChapter, queryDb, test } from "./fixtures"

type View = "Board" | "Corkboard" | "Matrix" | "Timeline"

/** Opens the sample book's plan from the header, in one of its views. */
async function openPlan(page: Page, view: View = "Board") {
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Plan" }).click()
  if (view !== "Board") {
    await page.getByRole("navigation", { name: "Plan views" }).getByRole("link", { name: view }).click()
  }
  await expect(page.getByRole("heading", { level: 1, name: `Plan: ${view}` })).toBeAttached()
}

/** Opens the home screen once the sample book has seeded. */
async function openHome(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
}

/** An act's cards on the Board or Corkboard, by their "Chapter N: Title" buttons. */
const cards = (page: Page, act: string) =>
  page.getByRole("list", { name: act, exact: true }).getByRole("button", { name: /^Chapter \d+: / })

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })

/** The polite live region behind `announce()`; dnd-kit keeps its own. */
const announcer = (page: Page) => page.locator('div.sr-only[role="status"]')

/** A device pref (`ui_prefs`), or "" when there's none. */
const pref = async (page: Page, key: string) =>
  (await queryDb<{ value: string | null }>(page, "SELECT value FROM ui_prefs WHERE id = ?", [key]))[0]?.value ?? ""

const bookRow = async (page: Page, bookId: string) =>
  (
    await queryDb<{ premise: string | null; synopsis: string | null; template_key: string | null }>(
      page,
      "SELECT premise, synopsis, template_key FROM books WHERE id = ?",
      [bookId],
    )
  )[0]

test.describe("Matrix", () => {
  test("flags a story point gone quiet, and marking it in a chapter clears that", async ({ page }) => {
    await openPlan(page, "Matrix")
    const note = page.getByRole("note").filter({ hasText: "goes quiet" })
    await expect(note).toContainText("Grief goes quiet for chapters 3–5.")

    const quiet = page.getByRole("button", { name: "Grief in chapter 4 (quiet for chapters 3–5)" })
    await expect(quiet).toHaveAttribute("aria-pressed", "false")
    await quiet.click()
    const cell = page.getByRole("button", { name: "Grief in chapter 4", exact: true })
    await expect(cell).toHaveAttribute("aria-pressed", "true")
    await expect(note).toHaveCount(0)
  })

  test("a character's cell marks them present, or the point of view in place of another", async ({ page }) => {
    await openPlan(page, "Matrix")
    const jonas = page.getByRole("button", { name: /^Jonas Quill in chapter 5: / })
    const mara = page.getByRole("button", { name: /^Mara Quill in chapter 5: / })
    await expect(jonas).toHaveAccessibleName("Jonas Quill in chapter 5: not in this chapter")
    await jonas.click()
    await page.getByRole("menuitemradio", { name: "Present", exact: true }).click()
    await expect(jonas).toHaveAccessibleName("Jonas Quill in chapter 5: present")
    await expect(jonas).toBeFocused()

    await jonas.click()
    const pov = page.getByRole("menuitemradio", { name: /^Point of view/ })
    await expect(pov).toContainText("Instead of Mara Quill")
    await pov.click()
    await expect(jonas).toHaveAccessibleName("Jonas Quill in chapter 5: point of view")
    await expect(mara).toHaveAccessibleName("Mara Quill in chapter 5: present")

    await page.reload()
    await expect(jonas).toHaveAccessibleName("Jonas Quill in chapter 5: point of view")
    await expect(mara).toHaveAccessibleName("Mara Quill in chapter 5: present")
  })

  test("arrow keys move between cells, Tab comes back to the same one, and Enter opens a chapter", async ({
    page,
  }) => {
    await openPlan(page, "Matrix")
    const grid = page.getByRole("grid", { name: "Matrix: who and what is in each chapter" })
    const button = (name: string | RegExp) => grid.getByRole("button", { name, exact: typeof name === "string" })

    await button("Chapter 1: The Ferry Home").focus()
    await page.keyboard.press("ArrowDown")
    await expect(button(/^Agnes Morrow in chapter 1: /)).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(button(/^Agnes Morrow in chapter 2: /)).toBeFocused()
    await page.keyboard.press("End")
    await expect(button(/^Agnes Morrow in chapter 12: /)).toBeFocused()
    await page.keyboard.press("Home")
    await expect(grid.getByRole("link", { name: "Agnes Morrow", exact: true })).toBeFocused()
    await page.keyboard.press("Control+End")
    await expect(button("Mara & Elias in chapter 12")).toBeFocused()
    await page.keyboard.press("Control+Home")
    await expect(button("Chapter 1: The Ferry Home")).toBeFocused()
    await page.keyboard.press("ArrowRight")
    const chapter2 = button("Chapter 2: The Keeper's Room")
    await expect(chapter2).toBeFocused()

    // The grid is one stop for Tab, and keeps its place.
    await page.keyboard.press("Shift+Tab")
    await expect(chapter2).not.toBeFocused()
    await page.keyboard.press("Tab")
    await expect(chapter2).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" })).toBeVisible()
  })
})

test.describe("Timeline", () => {
  test("shows the story's order or the reader's, and remembers which", async ({ page }) => {
    await openPlan(page, "Timeline")
    await expect(page.getByRole("radio", { name: "Story order" })).toBeChecked()
    const story = page.getByRole("table", { name: "Timeline: chapters in story order" })
    // The flashback comes first, set apart from the main story.
    await expect(story.locator('th[scope="colgroup"]')).toHaveText(["Outside the main story: Flashback", "Main story"])
    await expect(story.locator('th[scope="col"]').first()).toHaveText("12 years earlier")

    await page.getByRole("radio", { name: "Reading order" }).click()
    const reading = page.getByRole("table", { name: "Timeline: chapters in reading order" })
    await expect(reading.locator('[data-time-jump="outside"]')).toHaveText(["Outside the main story: Flashback"])
    await expect(reading.locator('[data-time-jump="back"]')).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole("radio", { name: "Reading order" })).toBeChecked()
    await expect(reading).toBeVisible()
  })

  test("a chapter's story time is set in its pop-out, and a step back in time is flagged", async ({ page }) => {
    await openPlan(page, "Timeline")
    await page.getByRole("button", { name: "Chapter 5: The Archive" }).click()
    const popout = page.getByRole("dialog", { name: "Chapter 5: The Archive" })
    const time = popout.getByRole("button", { name: /^Story time / })
    await expect(time).toHaveAccessibleName("Story time Day 4, morning")

    await time.click()
    await page.getByRole("textbox", { name: "Day", exact: true }).fill("2")
    await page.getByRole("button", { name: "Done", exact: true }).click()
    await expect(time).toHaveAccessibleName("Story time Day 2, morning")
    await popout.getByRole("button", { name: "Close details" }).click()
    await expect(popout).toBeHidden()

    // Day 2 comes before chapter 4's Day 3, which readers have already read.
    await page.getByRole("radio", { name: "Reading order" }).click()
    const reading = page.getByRole("table", { name: "Timeline: chapters in reading order" })
    await expect(reading.locator('[data-time-jump="back"]')).toHaveText(["Back in time (before ch 4)"])
    await expect(reading.locator('th[scope="col"]').nth(4)).toContainText("Day 2, morning")
  })
})

test.describe("Corkboard", () => {
  test("writes on the cards, moves them with Alt+arrows, and adds a card to an act", async ({ page }) => {
    await openPlan(page, "Corkboard")
    const summary = "Mara reads the harbor records by lamplight."
    await page.getByRole("textbox", { name: "Summary of chapter 5" }).fill(summary)
    await page.getByRole("textbox", { name: "Title of chapter 5" }).fill("The Records Room")
    const saved = async (title: string) =>
      (await queryDb<{ summary: string | null }>(page, "SELECT summary FROM chapters WHERE title = ?", [title]))[0]
    await expect.poll(async () => (await saved("The Records Room"))?.summary).toBe(summary)

    await page.getByRole("button", { name: "Chapter 1: The Ferry Home" }).focus()
    await page.keyboard.press("Alt+ArrowRight")
    await expect(announcer(page)).toHaveText("Moved to position 2 of 4 in “ACT I — Arrival”")
    await expect(page.getByRole("button", { name: "Chapter 2: The Ferry Home" })).toBeFocused()

    // An index card's title is written on the card.
    await page.getByRole("button", { name: "Add chapter to ACT I — Arrival", exact: true }).click()
    const title = page.getByRole("textbox", { name: "Title of chapter 5" })
    await expect(title).toBeFocused()
    await expect(title).toHaveValue("")
    await title.fill("The Lamp Room")
    await expect(cards(page, "ACT I — Arrival")).toHaveCount(5)
    await expect(page.getByRole("textbox", { name: "Title of chapter 6" })).toHaveValue("The Records Room")
    await expect.poll(async () => (await saved("The Lamp Room")) !== undefined).toBe(true)
  })
})

test.describe("Structure ribbon", () => {
  test("shows where the structure's moments fall, and marks a chapter as one, with Undo", async ({ page }) => {
    await openPlan(page)
    const ribbon = page.getByRole("region", { name: "15-beat structure" })
    await expect(ribbon).toContainText("10 of 15 moments marked · placed by word count targets")
    const toolbar = ribbon.getByRole("toolbar", { name: "Structure moments" })
    await expect(toolbar.getByRole("button")).toHaveCount(15)
    const pin = (name: string) => toolbar.getByRole("button", { name, exact: true })

    // Arrow keys move between the pins, so the ribbon is one stop for Tab.
    await pin("1. Opening image, marked in Ch 1").focus()
    await page.keyboard.press("End")
    await expect(pin("15. Final image, marked in Ch 12")).toBeFocused()
    await page.keyboard.press("Home")
    await expect(pin("1. Opening image, marked in Ch 1")).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(pin("2. Theme stated, not marked yet")).toBeFocused()

    await page.keyboard.press("Enter")
    const details = page.getByRole("dialog", { name: "2. Theme stated" })
    await expect(details).toContainText("Ch 1 is marked as “Opening image” now. This replaces it.")
    await details.getByRole("button", { name: "Mark Ch 1 as this moment" }).click()
    await expect(details).toBeHidden()
    const marked = toast(page, "Ch 1 marked as Theme stated")
    await expect(marked).toBeVisible()
    await expect(pin("1. Opening image, not marked yet")).toBeVisible()
    await expect(pin("2. Theme stated, marked in Ch 1")).toBeVisible()

    await marked.getByRole("button", { name: "Undo" }).click()
    await expect(pin("1. Opening image, marked in Ch 1")).toBeVisible()
    await expect(pin("2. Theme stated, not marked yet")).toBeVisible()
  })

  test("hides, stays hidden after a reload, and the Structure menu shows it again", async ({ page }) => {
    await openPlan(page)
    const ribbon = page.getByRole("region", { name: "15-beat structure" })
    await ribbon.getByRole("button", { name: "Hide" }).click()
    await expect(ribbon).toHaveCount(0)
    await expect(announcer(page)).toHaveText("Structure ribbon hidden. The Structure menu shows it again.")
    const menu = page.getByRole("button", { name: "Story structure: 15-beat structure" })
    await expect(menu).toBeFocused()
    const bookId = openBookId(page)
    await expect.poll(() => pref(page, `plan.ribbon:${bookId}`)).toBe("hidden")

    await page.reload()
    await expect(page.getByRole("button", { name: "Chapter 1: The Ferry Home" })).toBeVisible()
    await expect(ribbon).toHaveCount(0)
    await menu.click()
    const show = page.getByRole("menuitemcheckbox", { name: /^Show the structure ribbon/ })
    await expect(show).not.toBeChecked()
    // It stays open, to see the change.
    await show.click()
    await expect(show).toBeChecked()
    await page.keyboard.press("Escape")
    await expect(ribbon).toBeVisible()
  })
})

test.describe("Structure menu", () => {
  test("changes the book's structure, or takes it away", async ({ page }) => {
    await openPlan(page)
    await page.getByRole("button", { name: "Story structure: 15-beat structure" }).click()
    await page.getByRole("menuitemradio", { name: /^Three-act structure/ }).click()
    await expect(announcer(page)).toHaveText("Story structure: Three-act structure")
    await expect(page.getByRole("region", { name: "Three-act structure" })).toContainText("1 of 8 moments marked")

    // A chapter keeps a moment from the structure it followed before, and says where it's from.
    await page.getByRole("button", { name: "Chapter 1: The Ferry Home" }).click()
    const popout = page.getByRole("dialog", { name: "Chapter 1: The Ferry Home" })
    await expect(popout.getByRole("combobox", { name: "Structure moment" })).toHaveText(
      "Opening image (from 15-beat structure)",
    )
    await popout.getByRole("button", { name: "Close details" }).click()
    await expect(popout).toBeHidden()

    await page.getByRole("button", { name: "Story structure: Three-act structure" }).click()
    await page.getByRole("menuitemradio", { name: "None", exact: true }).click()
    await expect(page.getByRole("button", { name: "Story structure: none" })).toBeVisible()
    await expect(page.locator('[data-tour="plan-ribbon"]')).toHaveCount(0)
  })
})

test.describe("New book", () => {
  test("starts from a structure, with a chapter for each moment in its acts", async ({ page }) => {
    await openHome(page)
    await page.getByRole("button", { name: "New book" }).click()
    const dialog = page.getByRole("dialog", { name: "New book" })
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("The Circle")

    const target = dialog.getByRole("textbox", { name: "Word count target" })
    await expect(target).toHaveValue("80,000")
    await target.fill("lots")
    await expect(dialog.getByText("Type a number of words, like 80,000, or leave it empty.")).toBeVisible()
    await dialog.getByRole("button", { name: "Create book" }).click()
    await expect(target).toBeFocused()
    await expect(target).toHaveAttribute("aria-invalid", "true")

    await target.fill("60000")
    await dialog.getByRole("combobox", { name: "Start with" }).click()
    await page.getByRole("option", { name: "Story circle (8 steps)" }).click()
    // Leaving the field puts the separators in.
    await expect(target).toHaveValue("60,000")
    await expect(dialog).toContainText("You get 8 chapters in 3 acts, one for each of its moments, titled to match.")
    await dialog.getByRole("button", { name: "Create book" }).click()

    await expect(page).toHaveURL(/\/plan\/board$/)
    await expect(cards(page, "Comfort zone")).toHaveCount(2)
    await expect(cards(page, "The search")).toHaveCount(4)
    await expect(cards(page, "Coming back")).toHaveCount(2)
    await expect(cards(page, "Comfort zone").first()).toHaveAccessibleName("Chapter 1: You")
    await expect(cards(page, "Coming back").last()).toHaveAccessibleName("Chapter 8: Change")
    await expect(page.getByRole("region", { name: "Story circle (8 steps)" })).toContainText("8 of 8 moments marked")

    // The book's target is shared out between its chapters.
    const bookId = openBookId(page)
    const [book] = await queryDb<{ target_words: number }>(page, "SELECT target_words FROM books WHERE id = ?", [
      bookId,
    ])
    expect(book?.target_words).toBe(60_000)
    const chapters = await queryDb<{ word_target: number }>(
      page,
      "SELECT word_target FROM chapters WHERE book_id = ? AND deleted_at IS NULL",
      [bookId],
    )
    expect(chapters.map((chapter) => chapter.word_target)).toEqual(Array<number>(8).fill(7500))

    await page.getByRole("button", { name: "Chapter 1: You" }).click()
    const popout = page.getByRole("dialog", { name: "Chapter 1: You" })
    const moment = popout.getByRole("combobox", { name: "Structure moment" })
    await expect(moment).toHaveText("1. You")
    await expect(moment).toHaveAccessibleDescription(/^A character in their comfort zone\./)
  })
})

test.describe("Plan step by step", () => {
  test("plans a new book a step at a time, keeps the draft, and Undo takes it all back", async ({ page }) => {
    await openHome(page)
    await page.getByRole("button", { name: "New book" }).click()
    const newBook = page.getByRole("dialog", { name: "New book" })
    await newBook.getByRole("textbox", { name: "Title", exact: true }).fill("Harbor Lights")
    await newBook.getByRole("combobox", { name: "Start with" }).click()
    await page.getByRole("option", { name: "Plan it step by step" }).click()
    await newBook.getByRole("button", { name: "Create book" }).click()

    const wizard = page.getByRole("dialog", { name: "Plan step by step" })
    const premise = wizard.getByRole("textbox", { name: "Your story in one sentence" })
    await expect(premise).toBeFocused()
    await premise.fill("A keeper's daughter learns why the light went dark.")
    await wizard.getByRole("button", { name: "Next" }).click()
    await expect(wizard.getByRole("heading", { name: "Your story in five sentences" })).toBeFocused()
    await wizard.getByRole("textbox", { name: "1. Beginning" }).fill("Mara comes home")
    await wizard.getByRole("textbox", { name: "2. First disaster" }).fill("The ledger is stolen")
    await wizard.getByRole("textbox", { name: "5. Ending" }).fill("She lights the lamp")

    // Closing keeps the draft, and opening it again picks up where it was.
    await page.keyboard.press("Escape")
    await expect(wizard).toBeHidden()
    const bookId = openBookId(page)
    const draftKey = `plan.wizard:${bookId}`
    await expect.poll(() => pref(page, draftKey)).toContain("She lights the lamp")
    const reopen = async () => {
      await page.getByRole("button", { name: "Story structure: none" }).click()
      await page.getByRole("menuitem", { name: "Plan step by step…" }).click()
    }
    await reopen()
    await expect(wizard.getByRole("heading", { name: "Your story in five sentences" })).toBeFocused()
    await expect(wizard.getByRole("textbox", { name: "2. First disaster" })).toHaveValue("The ledger is stolen")

    await wizard.getByRole("button", { name: "Next" }).click()
    await expect(wizard.getByRole("heading", { name: "Your main characters" })).toBeFocused()
    await wizard.getByRole("textbox", { name: "Name", exact: true }).fill("Mara Quill")
    await wizard.getByRole("textbox", { name: "Part in the story" }).fill("Hero")
    await wizard.getByRole("textbox", { name: "What they want" }).fill("To learn the truth")
    await wizard.getByRole("button", { name: "Next" }).click()
    await expect(wizard.getByRole("heading", { name: "Your chapters" })).toBeFocused()
    await expect(wizard).toContainText("Here's a chapter for each of your five sentences, in three acts.")
    const titles = wizard.getByRole("textbox", { name: "Chapter title" })
    await expect(titles).toHaveCount(3)
    await expect(titles.nth(0)).toHaveValue("Beginning")
    await expect(titles.nth(1)).toHaveValue("First disaster")
    await expect(titles.nth(2)).toHaveValue("Ending")

    await wizard.getByRole("button", { name: "Add to my plan" }).click()
    await expect(wizard).toBeHidden()
    const added = toast(page, "Added 3 chapters and 1 character")
    await expect(added).toBeVisible()
    // They take the place of the blank chapter, and an act left empty isn't added.
    await expect(page.getByRole("button", { name: /^Chapter \d+: / })).toHaveCount(3)
    await expect(cards(page, "Act I — Setup")).toHaveCount(2)
    await expect(cards(page, "Act III — Resolution")).toHaveCount(1)
    await expect(page.getByRole("list", { name: "Act II — Confrontation" })).toHaveCount(0)
    await expect
      .poll(async () => {
        const book = await bookRow(page, bookId)
        return { premise: book?.premise, synopsis: book?.synopsis }
      })
      .toEqual({
        premise: "A keeper's daughter learns why the light went dark.",
        synopsis: "Mara comes home. The ledger is stolen. She lights the lamp.",
      })

    await added.getByRole("button", { name: "Undo" }).click()
    await expect(added).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Chapter \d+: / })).toHaveCount(1)
    await expect(page.getByRole("button", { name: "Chapter 1: Untitled chapter" })).toBeVisible()
    await expect
      .poll(async () => {
        const book = await bookRow(page, bookId)
        return { premise: book?.premise ?? null, synopsis: book?.synopsis ?? null }
      })
      .toEqual({ premise: null, synopsis: null })
    const characters = async () =>
      (
        await queryDb<{ n: number }>(
          page,
          `SELECT count(*) AS n FROM codex_entries
           WHERE universe_id = (SELECT universe_id FROM books WHERE id = ?) AND deleted_at IS NULL`,
          [bookId],
        )
      )[0]?.n
    await expect.poll(characters).toBe(0)

    // Undo brings the draft back too.
    await expect.poll(() => pref(page, draftKey)).toContain("She lights the lamp")
    await reopen()
    await expect(wizard.getByRole("heading", { name: "Your chapters" })).toBeFocused()
    await wizard.getByRole("button", { name: "Add to my plan" }).click()
    await expect(toast(page, "Added 3 chapters and 1 character")).toBeVisible()
    await expect.poll(characters).toBe(1)

    await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
    await expect(page.getByRole("heading", { level: 2, name: "Character: Mara Quill", exact: true })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Role", exact: true })).toHaveValue("Hero")
    await expect(page.getByRole("textbox", { name: "Goal", exact: true })).toHaveValue("To learn the truth")
  })

  test("adds to a book that has chapters in new acts, and says when it replaced the synopsis", async ({ page }) => {
    await openPlan(page)
    const bookId = openBookId(page)
    const synopsis = async () => (await bookRow(page, bookId))?.synopsis
    await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
    await page.getByRole("menuitem", { name: "Book settings…" }).click()
    const settings = page.getByRole("dialog", { name: "Book settings" })
    await settings.getByRole("textbox", { name: "Synopsis" }).fill("Mara comes home, and finds the ledger.")
    await settings.getByRole("button", { name: "Save", exact: true }).click()
    await expect(settings).toBeHidden()
    await expect.poll(synopsis).toBe("Mara comes home, and finds the ledger.")

    await page.getByRole("button", { name: "Story structure: 15-beat structure" }).click()
    await page.getByRole("menuitem", { name: "Plan step by step…" }).click()
    const wizard = page.getByRole("dialog", { name: "Plan step by step" })
    await wizard.getByRole("button", { name: "2. Your story in five sentences" }).click()
    await expect(wizard).toContainText(
      "Your book already has a synopsis, in Book settings. Writing these replaces it when you add them to your plan.",
    )
    await wizard.getByRole("textbox", { name: "1. Beginning" }).fill("Mara inherits the light")
    await wizard.getByRole("button", { name: "4. Your chapters" }).click()
    await expect(wizard).toContainText("Your book already has 12 chapters. These go after them, in new acts.")
    await expect(wizard.getByRole("checkbox", { name: "Add these chapters to the plan" })).toBeChecked()
    await wizard.getByRole("button", { name: "Add to my plan" }).click()

    const added = toast(page, "Added 1 chapter, and replaced your synopsis")
    await expect(added).toBeVisible()
    await expect(cards(page, "Act I — Setup")).toHaveCount(1)
    await expect(cards(page, "Act I — Setup")).toHaveAccessibleName("Chapter 13: Beginning")
    await expect.poll(synopsis).toBe("Mara inherits the light.")

    await added.getByRole("button", { name: "Undo" }).click()
    await expect.poll(synopsis).toBe("Mara comes home, and finds the ledger.")
    await expect(page.getByRole("button", { name: /^Chapter \d+: / })).toHaveCount(12)
    await expect(page.getByRole("list", { name: "Act I — Setup" })).toHaveCount(0)
  })
})

test.describe("Your structures", () => {
  test("makes one from a copy, shares it as a file, and deletes it with Undo", async ({ page }) => {
    await openPlan(page)
    const bookId = openBookId(page)
    const templateKey = async () => (await bookRow(page, bookId))?.template_key ?? null
    await page.getByRole("button", { name: "Story structure: 15-beat structure" }).click()
    await page.getByRole("menuitem", { name: "Your structures…" }).click()
    const dialog = page.locator("[data-structures-dialog]")
    await expect(dialog).toContainText("You haven't made one yet.")
    const create = dialog.getByRole("button", { name: "New structure" })
    await expect(create).toBeFocused()

    await create.click()
    await page.getByRole("menuitem", { name: "15-beat structure", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "New story structure" })).toBeVisible()
    const name = dialog.getByRole("textbox", { name: "Name", exact: true })
    await expect(name).toBeFocused()
    await expect(name).toHaveValue("15-beat structure (copy)")
    await name.fill("My beats")
    await expect(dialog.getByRole("checkbox", { name: "Use it for this book" })).toBeChecked()
    await dialog.getByRole("button", { name: "Save structure" }).click()

    const list = dialog.getByRole("list", { name: "Your story structures" })
    const item = (structure: string) =>
      list.getByRole("listitem").filter({ has: page.getByText(structure, { exact: true }) })
    const change = (structure: string) => dialog.getByRole("button", { name: `Change “${structure}”` })
    await expect(item("My beats")).toContainText("15 moments, 3 acts · This book follows it")
    await expect(change("My beats")).toBeFocused()
    const templateId = await change("My beats").getAttribute("data-structure-edit")
    await expect.poll(templateKey).toBe(`custom:${templateId}`)

    // Saved as a file to share, and opened again as a copy.
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Save “My beats” as a file" }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe("My beats.json")
    const shared = await readFile(await file.path())
    const json = JSON.parse(shared.toString("utf8")) as { acts: unknown[]; beats: unknown[] }
    expect(json).toMatchObject({ format: "bookbookbook-structure", version: 1, name: "My beats" })
    expect(json.acts).toHaveLength(3)
    expect(json.beats).toHaveLength(15)

    const input = dialog.locator('input[type="file"]')
    await input.setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("notes") })
    await expect(dialog.getByRole("alert")).toHaveText("That file isn't a structure: it isn't JSON.")
    await input.setInputFiles({ name: "My beats.json", mimeType: "application/json", buffer: shared })
    await expect(item("My beats 2")).toContainText("15 moments, 3 acts")
    await expect(item("My beats 2")).not.toContainText("This book follows it")
    await expect(change("My beats 2")).toBeFocused()
    await expect(dialog.getByRole("alert")).toHaveCount(0)

    // Deleting the structure the book follows leaves it with none, until Undo.
    await dialog.getByRole("button", { name: "Delete “My beats”" }).click()
    await expect(item("My beats")).toHaveCount(0)
    await expect(change("My beats 2")).toBeFocused()
    await expect.poll(templateKey).toBeNull()
    const deleted = toast(page, "Deleted “My beats”")
    await deleted.getByRole("button", { name: "Undo" }).click()
    await expect(change("My beats")).toBeFocused()
    await expect.poll(templateKey).toBe(`custom:${templateId}`)
    await expect(dialog).toBeVisible()
    await expect(deleted).toHaveCount(0)

    // Undo by keyboard, over the dialog.
    await dialog.getByRole("button", { name: "Delete “My beats 2”" }).click()
    await expect(change("My beats")).toBeFocused()
    const again = toast(page, "Deleted “My beats 2”")
    await expect(again).toBeVisible()
    await page.keyboard.press("Alt+T")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await expect(again.getByRole("button", { name: "Undo" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(change("My beats 2")).toBeFocused()
    await expect(again).toHaveCount(0)

    // Escape in the toasts goes back to the dialog, and only then closes it.
    await dialog.getByRole("button", { name: "Delete “My beats 2”" }).click()
    await expect(change("My beats")).toBeFocused()
    await page.keyboard.press("Alt+T")
    await expect(change("My beats")).not.toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await expect(change("My beats")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(page.getByRole("button", { name: "Story structure: My beats" })).toBeFocused()
  })
})
