import type { Page } from "@playwright/test"
import { expect, FIRST_LOAD_TIMEOUT, offerInstall, queryDb, test } from "./fixtures"

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 " +
  "Mobile/15E148 Safari/604.1"
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 " +
  "Safari/605.1.15"

const firstBook = (page: Page) => page.getByRole("link", { name: "The Salt Ledger" })
const notice = (page: Page, title: string) => page.getByRole("region", { name: title })
const palette = (page: Page) => page.getByRole("dialog", { name: "Search" })
const installCommand = (page: Page) => palette(page).getByRole("option", { name: /^Install bookbookbook/ })
const glossaryTerm = (page: Page, name: string) =>
  page.getByRole("dialog", { name: "Glossary" }).getByRole("article", { name, exact: true })
const prompted = (page: Page) => page.evaluate(() => window.__install.prompted)
const noticePref = async (page: Page) =>
  (await queryDb<{ value: string }>(page, "SELECT value FROM ui_prefs WHERE id = 'install.notice'"))[0]?.value

/** Opens the home screen once the sample book has seeded. */
async function openHome(page: Page) {
  await page.goto("/")
  await expect(firstBook(page)).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
}

/**
 * Searches for "install", once the glossary's word for it is listed. From the Search button: the shortcut is ⌘K
 * for an Apple device's browser.
 */
async function searchInstall(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "Search", exact: true }).click()
  await expect(palette(page).getByRole("combobox", { name: "Search" })).toBeFocused()
  await page.keyboard.type("install")
  await expect(palette(page).getByRole("option", { name: /^Installing the app/ })).toBeVisible()
}

test.describe("in Chrome", () => {
  test("holds the browser's offer for the home screen, which goes once the app's installed", async ({ page }) => {
    await openHome(page)
    const install = notice(page, "Install bookbookbook")
    await expect(install).toHaveCount(0)

    await offerInstall(page)
    // Kept for the notice, rather than shown by the browser as a banner of its own.
    expect(await page.evaluate(() => window.__install.kept)).toBe(true)
    await expect(install).toContainText("Your books come with it.")
    const button = install.getByRole("button", { name: "Install", exact: true })
    await button.click()
    await expect.poll(() => prompted(page)).toBe(1)
    // While the browser asks.
    await expect(button).toHaveAttribute("aria-disabled", "true")

    await page.evaluate(() => window.__install.answer("accepted"))
    await expect(install).toHaveCount(0)
    await expect(firstBook(page)).toBeFocused()

    // Installed, nothing offers to install, but the glossary still tells how.
    await searchInstall(page)
    await expect(installCommand(page)).toHaveCount(0)
  })

  test("turning the browser's dialog down hides the notice until the next visit", async ({ page }) => {
    await openHome(page)
    await offerInstall(page)
    const install = notice(page, "Install bookbookbook")
    await install.getByRole("button", { name: "Install", exact: true }).click()
    await expect.poll(() => prompted(page)).toBe(1)
    await page.evaluate(() => window.__install.answer("dismissed"))
    await expect(install).toHaveCount(0)
    await expect(firstBook(page)).toBeFocused()

    // Should the browser offer again on this visit, Search has it, but the notice waits.
    await offerInstall(page)
    await searchInstall(page)
    await expect(installCommand(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(install).toHaveCount(0)

    await openHome(page)
    await offerInstall(page)
    await expect(install).toBeVisible()
  })

  test("Not now hides the notice for good, and Search still installs", async ({ page }) => {
    await openHome(page)
    await offerInstall(page)
    const install = notice(page, "Install bookbookbook")
    await install.getByRole("button", { name: "Not now" }).click()
    await expect(install).toHaveCount(0)
    await expect(firstBook(page)).toBeFocused()
    await expect.poll(() => noticePref(page)).toBe("dismissed")

    await openHome(page)
    await offerInstall(page)
    await searchInstall(page)
    await installCommand(page).click()
    await expect(palette(page)).toBeHidden()
    await expect.poll(() => prompted(page)).toBe(1)
    await expect(install).toHaveCount(0)
  })

  test("as the installed app, offers nothing", async ({ page }) => {
    // As in the app's own window.
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        const list = matchMedia(query)
        return query === "(display-mode: standalone)" ? Object.defineProperty(list, "matches", { value: true }) : list
      }
    })
    await openHome(page)
    await offerInstall(page)
    await searchInstall(page)
    await expect(installCommand(page)).toHaveCount(0)
    await expect(notice(page, "Install bookbookbook")).toHaveCount(0)
  })

  test("Backups offers to install when the browser won't promise to keep the books", async ({ page }) => {
    await page.addInitScript(() => {
      const no = () => Promise.resolve(false)
      Object.defineProperty(StorageManager.prototype, "persisted", { value: no })
      Object.defineProperty(StorageManager.prototype, "persist", { value: no })
    })
    await openHome(page)
    await offerInstall(page)
    await page.getByRole("button", { name: "Backups" }).click()
    const browser = page.getByRole("dialog", { name: "Backups" }).getByRole("region", { name: "This browser" })
    await expect(browser.getByRole("button", { name: "Install bookbookbook" })).toHaveCount(0)
    await browser.getByRole("button", { name: "Ask the browser to keep them" }).click()
    await expect(browser).toContainText("The browser said no for now.")

    await browser.getByRole("button", { name: "Install bookbookbook" }).click()
    await expect.poll(() => prompted(page)).toBe(1)
    await page.evaluate(() => window.__install.answer("accepted"))
    await expect(browser.getByRole("button", { name: "Install bookbookbook" })).toHaveCount(0)
    await expect(browser.getByRole("button", { name: "Ask again" })).toBeFocused()
  })
})

for (const [device, userAgent, title, steps] of [
  // What a screen reader says too, the icons aside.
  ["an iPhone", IPHONE_SAFARI, "Add bookbookbook to your Home Screen", /Share\s*\(under More\s*, if you don't see/],
  ["a Mac", MAC_SAFARI, "Add bookbookbook to your Dock", "choose File, then Add to Dock"],
] as const) {
  test.describe(`in Safari on ${device}`, () => {
    test.use({ userAgent })

    test("gives Safari's steps, which Search finds in the glossary, until Got it", async ({ page }) => {
      await openHome(page)
      const howTo = notice(page, title)
      await expect(howTo).toContainText(steps)
      // The app keeps books of its own, so those begun in the browser go by backup.
      await expect(howTo).toContainText("restore that backup in the app")

      await searchInstall(page)
      await expect(installCommand(page)).toContainText("Glossary")
      await installCommand(page).click()
      await expect(glossaryTerm(page, "Installing the app")).toBeFocused()
      await page.keyboard.press("Escape")

      await howTo.getByRole("button", { name: "Got it" }).click()
      await expect(howTo).toHaveCount(0)
      await expect(firstBook(page)).toBeFocused()
      await expect.poll(() => noticePref(page)).toBe("dismissed")
      await openHome(page)
      await searchInstall(page)
      await expect(installCommand(page)).toBeVisible()
      await expect(howTo).toHaveCount(0)
    })
  })
}

test.describe("on an iPhone's Home Screen", () => {
  test.use({ userAgent: IPHONE_SAFARI })

  test("offers nothing in the app itself", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }))
    await openHome(page)
    await searchInstall(page)
    await expect(installCommand(page)).toHaveCount(0)
    await expect(page.getByRole("region", { name: /^Add bookbookbook/ })).toHaveCount(0)
  })
})
