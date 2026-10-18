import type { Page } from "@playwright/test"
import { expect, FIRST_LOAD_TIMEOUT, openFirstChapter, test } from "./fixtures"

const glossary = (page: Page) => page.getByRole("dialog", { name: "Glossary" })
const term = (page: Page, name: string) => glossary(page).getByRole("article", { name, exact: true })
const tourCard = (page: Page) => page.locator("[data-tour-card]")
const howToUse = (page: Page) => page.getByRole("button", { name: "How to use this" })
/** By its marker: while a tour card shows, the page behind it is hidden from the accessibility tree. */
const popout = (page: Page) => page.locator("[data-chapter-popout]")

async function openHome(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
}

async function openScreen(page: Page, name: "Plan" | "World" | "Inbox") {
  await openFirstChapter(page)
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name }).click()
}

test.describe("Glossary", () => {
  test("finds a word by the name writers know it by, and follows See also", async ({ page }) => {
    await openFirstChapter(page)
    const opener = page.getByRole("button", { name: "Glossary" })
    await opener.click()
    const search = glossary(page).getByRole("searchbox", { name: "Search the glossary" })
    await expect(search).toBeFocused()

    await search.fill("beat")
    const first = glossary(page).getByRole("article").first()
    await expect(first).toHaveAccessibleName("Moment")
    await expect(first).toContainText("Also called “Beat” or “Story beat”")
    await first.getByRole("button", { name: "Scene", exact: true }).click()
    await expect(search).toHaveValue("")
    await expect(term(page, "Scene")).toBeFocused()

    await search.fill("codex")
    await expect(glossary(page).getByRole("article").first()).toHaveAccessibleName("World")
    await search.fill("zzz")
    await expect(glossary(page)).toContainText("Nothing in the glossary matches “zzz”.")

    await page.keyboard.press("Escape")
    await expect(glossary(page)).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test("a “?” beside a label opens it at that word, over the chapter, and gives focus back", async ({ page }) => {
    await openScreen(page, "Plan")
    await page.getByRole("button", { name: "Chapter 2: The Keeper's Room" }).click()
    const chapter = page.getByRole("dialog", { name: "Chapter 2: The Keeper's Room" })
    const hint = chapter.getByRole("button", { name: "What does “Moment” mean?" })
    await hint.click()
    await expect(term(page, "Moment")).toBeFocused()
    await expect(term(page, "Moment")).toBeInViewport()

    await page.keyboard.press("Escape")
    await expect(glossary(page)).toBeHidden()
    await expect(chapter).toBeVisible()
    await expect(hint).toBeFocused()
  })
})

test.describe("How to use this", () => {
  const TOURS = [
    { name: "home screen", title: "How to use the home screen", steps: 9, open: openHome },
    { name: "Plan", title: "How to use the Plan", steps: 11, open: (page: Page) => openScreen(page, "Plan") },
    { name: "Write", title: "How to use Write", steps: 10, open: openFirstChapter },
    { name: "World", title: "How to use World", steps: 7, open: (page: Page) => openScreen(page, "World") },
    { name: "Inbox", title: "How to use the Inbox", steps: 1, open: (page: Page) => openScreen(page, "Inbox") },
  ]

  for (const { name, title, steps, open } of TOURS) {
    test(`the ${name} tour goes a step at a time to the end, then gives focus back`, async ({ page }) => {
      await open(page)
      const opener = howToUse(page)
      await opener.click()
      const card = tourCard(page)
      await expect(card.getByRole("button", { name: "Back" })).toHaveAttribute("aria-disabled", "true")
      for (let step = 1; step <= steps; step++) {
        await expect(card).toContainText(`${title} · Step ${step} of ${steps}`)
        const next = card.getByRole("button", { name: step === steps ? "Done" : "Next" })
        await expect(next).toBeFocused()
        await next.click()
      }
      await expect(card).toHaveCount(0)
      await expect(opener).toBeFocused()
    })
  }

  test("the Plan tour opens a chapter for the steps about one, and Escape closes both", async ({ page }) => {
    await openScreen(page, "Plan")
    const opener = howToUse(page)
    await opener.click()
    const card = tourCard(page)
    const at = (step: number) => expect(card).toContainText(`How to use the Plan · Step ${step} of 11`)
    const back = card.getByRole("button", { name: "Back" })
    const next = card.getByRole("button", { name: "Next" })

    // The arrow keys move too.
    for (let step = 1; step <= 4; step++) {
      await at(step)
      await expect(next).toBeFocused()
      await page.keyboard.press("ArrowRight")
    }
    await at(5)
    await expect(page.getByRole("dialog", { name: "Moments" })).toBeVisible()
    await expect(popout(page)).toBeVisible()
    await expect(page).toHaveURL(/\?chapter=/)
    await expect(next).toBeFocused()

    await page.keyboard.press("ArrowLeft")
    await at(4)
    await expect(popout(page)).toBeHidden()
    await expect(back).toBeFocused()

    await page.keyboard.press("ArrowRight")
    await at(5)
    await next.click()
    await at(6)
    await expect(popout(page)).toBeVisible()
    await next.click()
    await at(7)
    await expect(popout(page)).toBeVisible()
    await next.click()
    await at(8)
    await expect(popout(page)).toBeHidden()
    await expect(next).toBeFocused()

    await back.click()
    await at(7)
    await expect(popout(page)).toBeVisible()
    await expect(back).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(card).toHaveCount(0)
    await expect(popout(page)).toBeHidden()
    await expect(page).not.toHaveURL(/chapter=/)
    await expect(opener).toBeFocused()
  })

  test("a step's word opens the glossary over the tour, and Escape goes back to the tour", async ({ page }) => {
    await openHome(page)
    await howToUse(page).click()
    const card = tourCard(page)
    await card.getByRole("button", { name: "Next" }).click()
    await expect(page.getByRole("dialog", { name: "Your books" })).toBeVisible()

    const explain = card.getByRole("button", { name: "What does “Word count target” mean?" })
    await explain.click()
    await expect(term(page, "Word count target")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(glossary(page)).toBeHidden()
    await expect(explain).toBeFocused()
    await expect(card).toContainText("Step 2 of 9")

    await page.keyboard.press("Escape")
    await expect(card).toHaveCount(0)
    await expect(howToUse(page)).toBeFocused()
  })

  test("leaving the page ends its tour", async ({ page }) => {
    await openFirstChapter(page)
    await howToUse(page).click()
    await expect(tourCard(page)).toContainText("Step 1 of 10")
    await page.goBack()
    await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible()
    await expect(tourCard(page)).toHaveCount(0)
  })
})
