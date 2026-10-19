import type { Locator, Page } from "@playwright/test"
import { expect, FIRST_LOAD_TIMEOUT, openFirstChapter, test } from "./fixtures"

const glossary = (page: Page) => page.getByRole("dialog", { name: "Glossary" })
const term = (page: Page, name: string) => glossary(page).getByRole("article", { name, exact: true })
const tourCard = (page: Page) => page.locator("[data-tour-card]")
const howToUse = (page: Page) => page.getByRole("button", { name: "How to use this" })
/** By its marker: while a tour card shows, the page behind it is hidden from the accessibility tree. */
const popout = (page: Page) => page.locator("[data-chapter-popout]")
/** What a step about `name` points at: as the tour finds it, the first one showing. */
const tourTarget = (page: Page, name: string) => page.locator(`[data-tour~="${name}"]:visible`).first()

/** Waits for the tour's spotlight to settle around `target`. */
async function expectSpotlightOn(page: Page, target: Locator) {
  await expect
    .poll(async () => {
      const [spot, box] = await Promise.all([page.locator("[data-tour-spotlight]").boundingBox(), target.boundingBox()])
      if (!spot || !box) return false
      return (
        spot.x <= box.x + 1 &&
        spot.y <= box.y + 1 &&
        spot.x + spot.width >= box.x + box.width - 1 &&
        spot.y + spot.height >= box.y + box.height - 1
      )
    })
    .toBe(true)
}

async function openHome(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
}

async function openScreen(page: Page, name: "Plan" | "World" | "Inbox") {
  await openFirstChapter(page)
  const link = page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name })
  await link.click()
  // A screen loads as it's first opened, and the helps in the header are the page's that shows.
  await expect(link).toHaveAttribute("aria-current", "page")
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
    { name: "home screen", title: "How to use the home screen", steps: 10, open: openHome },
    { name: "Plan", title: "How to use the Plan", steps: 13, open: (page: Page) => openScreen(page, "Plan") },
    { name: "Write", title: "How to use Write", steps: 15, open: openFirstChapter },
    { name: "World", title: "How to use World", steps: 7, open: (page: Page) => openScreen(page, "World") },
    { name: "Inbox", title: "How to use the Inbox", steps: 7, open: (page: Page) => openScreen(page, "Inbox") },
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
    const at = (step: number) => expect(card).toContainText(`How to use the Plan · Step ${step} of 13`)
    const back = card.getByRole("button", { name: "Back" })
    const next = card.getByRole("button", { name: "Next" })

    // The arrow keys move too.
    for (let step = 1; step <= 6; step++) {
      await at(step)
      await expect(next).toBeFocused()
      await page.keyboard.press("ArrowRight")
    }
    await at(7)
    await expect(page.getByRole("dialog", { name: "Moments" })).toBeVisible()
    await expect(popout(page)).toBeVisible()
    await expect(page).toHaveURL(/\?chapter=/)
    await expect(next).toBeFocused()

    await page.keyboard.press("ArrowLeft")
    await at(6)
    await expect(popout(page)).toBeHidden()
    await expect(back).toBeFocused()

    await page.keyboard.press("ArrowRight")
    await at(7)
    await next.click()
    await at(8)
    await expect(popout(page)).toBeVisible()
    await next.click()
    await at(9)
    await expect(popout(page)).toBeVisible()
    await next.click()
    await at(10)
    await expect(popout(page)).toBeHidden()
    await expect(next).toBeFocused()

    await back.click()
    await at(9)
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
    await expect(card).toContainText("Step 2 of 10")

    await page.keyboard.press("Escape")
    await expect(card).toHaveCount(0)
    await expect(howToUse(page)).toBeFocused()
  })

  test("the Inbox tour points at each part of it, then at Quick note", async ({ page }) => {
    await openScreen(page, "Inbox")
    await howToUse(page).click()
    const card = tourCard(page)
    const targets = [null, "inbox-capture", "dictate", "inbox-lists", "inbox-note", "quick-note", null]
    for (const [index, target] of targets.entries()) {
      await expect(card).toContainText(`How to use the Inbox · Step ${index + 1} of ${targets.length}`)
      if (target) await expectSpotlightOn(page, tourTarget(page, target))
      else await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0)
      if (target === "dictate") await expect(tourTarget(page, target)).toHaveAttribute("data-dictate", "inbox-capture")
      await card.getByRole("button", { name: index === targets.length - 1 ? "Done" : "Next" }).click()
    }
    await expect(card).toHaveCount(0)
  })

  test("the Write tour shows Dictate after the page, with its voice commands", async ({ page }) => {
    await openFirstChapter(page)
    await howToUse(page).click()
    const card = tourCard(page)
    for (let step = 1; step <= 5; step++) {
      await expect(card).toContainText(`How to use Write · Step ${step} of 15`)
      await card.getByRole("button", { name: "Next" }).click()
    }
    await expect(card).toContainText("Step 6 of 15")
    await expect(page.getByRole("dialog", { name: "Dictate" })).toBeVisible()
    await expectSpotlightOn(page, tourTarget(page, "dictate"))
    await expect(tourTarget(page, "dictate")).toHaveAttribute("data-dictate", "prose")

    const explain = card.getByRole("button", { name: "What does “Voice commands” mean?" })
    await explain.click()
    await expect(term(page, "Voice commands")).toBeFocused()
    await expect(term(page, "Voice commands")).toContainText("“Scratch that” takes back what you said last.")
    await page.keyboard.press("Escape")
    await expect(explain).toBeFocused()
    await expect(card).toContainText("Step 6 of 15")
  })

  test("leaving the page ends its tour", async ({ page }) => {
    await openFirstChapter(page)
    await howToUse(page).click()
    await expect(tourCard(page)).toContainText("Step 1 of 15")
    await page.goBack()
    await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible()
    await expect(tourCard(page)).toHaveCount(0)
  })
})
