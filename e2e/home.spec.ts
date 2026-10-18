import type { Page } from "@playwright/test"
import { expect, FIRST_LOAD_TIMEOUT, test } from "./fixtures"

const WORLD_URL = /\/b\/[^/]+\/world(\/[^/]+)?$/

/** Opens the home screen once the sample book has seeded. */
async function openHome(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
}

const card = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Your books" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title }) })

test("opens on the home screen, and reopens a book where it was left", async ({ page }) => {
  await openHome(page)
  await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible()
  await expect(card(page, "The Salt Ledger")).toContainText("12 chapters · Not opened yet")
  // The book menu is for the book that's open.
  await expect(page.getByRole("button", { name: /^Book: / })).toHaveCount(0)

  // A book with words in it opens at its first chapter.
  await page.getByRole("link", { name: "The Salt Ledger" }).click()
  await expect(page).toHaveURL(/\/b\/[^/]+\/write\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1, name: "The Ferry Home" })).toBeVisible()

  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "World" }).click()
  await expect(page).toHaveURL(WORLD_URL)
  await expect(page.getByRole("navigation", { name: "Entry types" })).toBeVisible()
  await page.getByRole("link", { name: "bookbookbook" }).click()
  await expect(page).toHaveURL(/^[^?#]+:\/\/[^/]+\/$/)
  await expect(card(page, "The Salt Ledger")).toContainText("12 chapters · Opened today")

  await page.getByRole("link", { name: "The Salt Ledger" }).click()
  await expect(page).toHaveURL(WORLD_URL)
  await expect(page.getByRole("heading", { level: 1, name: "World" })).toBeAttached()
})

test("a new book opens on its plan, and the home screen lists it first", async ({ page }) => {
  await openHome(page)
  await page.getByRole("button", { name: "New book" }).click()
  const dialog = page.getByRole("dialog", { name: "New book" })
  await dialog.getByRole("textbox", { name: "Title" }).fill("Harbor Lights")
  await dialog.getByRole("button", { name: "Create book" }).click()
  await expect(page).toHaveURL(/\/b\/[^/]+\/plan\/board$/)
  await expect(page.getByRole("button", { name: "Book: Harbor Lights" })).toBeVisible()

  await page.getByRole("button", { name: "Book: Harbor Lights" }).click()
  await page.getByRole("menuitem", { name: "All books" }).click()
  await expect(page.getByRole("list", { name: "Your books" }).getByRole("heading", { level: 2 })).toHaveText([
    "Harbor Lights",
    "The Salt Ledger",
  ])
  await expect(card(page, "Harbor Lights")).toContainText("1 chapter · Opened today")
})

test("the home screen's Backups covers every book, so it has none of its own to download", async ({ page }) => {
  await openHome(page)
  const opener = page.getByRole("button", { name: "Backups" })
  await opener.click()
  const dialog = page.getByRole("dialog", { name: "Backups" })
  await expect(dialog.getByRole("region", { name: "This browser" })).toBeVisible()
  await expect(dialog.getByRole("region", { name: "Folder backups" })).toBeVisible()
  await expect(dialog.getByRole("region", { name: "This book" })).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test("an address that isn't a page offers the way home", async ({ page }) => {
  await openHome(page)
  await page.goto("/no-such-page")
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible()
  await page.getByRole("link", { name: "Go to your books" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Your books" })).toBeVisible()
})
