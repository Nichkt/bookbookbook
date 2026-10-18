import type { Page } from "@playwright/test"
import { expect, FIRST_LOAD_TIMEOUT, focusEnd, openFirstChapter, test } from "./fixtures"

/*
 * The installable, offline app. Only the production build has its service worker, so these tests run against it, as
 * e2e/preview.ts serves it, and without the dev hooks (window.__bbb).
 */

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })
const updateToast = (page: Page) => toast(page, "A new version of bookbookbook is ready")

/** Opens the first chapter, the first time, and waits until bookbookbook would open offline. */
async function firstVisit(page: Page) {
  await openFirstChapter(page)
  await expect(toast(page, "Ready to work offline")).toBeVisible()
}

/** Publishes a new version, as a deploy would, to this test's browser alone (e2e/preview.ts). The page looks for it. */
async function publishNewVersion(page: Page) {
  await page.context().addCookies([{ name: "bbb-new-version", value: "new", url: new URL(page.url()).origin }])
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update()
  })
}

/** Which version runs the page: "new" once it's the one published, "first" before, or "none" yet. */
const runningVersion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const { controller } = navigator.serviceWorker
        if (!controller) return resolve("none")
        const channel = new MessageChannel()
        channel.port1.onmessage = (event: MessageEvent<string>) => resolve(event.data)
        controller.postMessage("version?", [channel.port2])
        // The first version doesn't answer.
        setTimeout(() => resolve("first"), 1000)
      }),
  )

/** Whether a new version is waiting to take over. */
const versionWaiting = (page: Page) =>
  page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))

test("opens offline once it's been opened, at any of its addresses", async ({ page, context, browser }) => {
  await firstVisit(page)
  const chapter = page.url()

  // As if it had been closed: no page of it open, nor the worker that runs its database.
  const browserSession = await browser.newBrowserCDPSession()
  const databaseWorkers = async () =>
    (await browserSession.send("Target.getTargets")).targetInfos.filter(({ type }) => type === "shared_worker").length
  expect(await databaseWorkers()).toBeGreaterThan(0)
  await page.goto("about:blank")
  await expect.poll(databaseWorkers).toBe(0)
  // Nor anything in the browser's own cache: all of it comes from the copy the service worker keeps.
  await (await context.newCDPSession(page)).send("Network.clearBrowserCache")
  await context.setOffline(true)

  await page.goto(chapter)
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toBeVisible()
  const screens = page.getByRole("navigation", { name: "Screens" })
  await screens.getByRole("link", { name: "Plan" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Plan: Board" })).toBeAttached()
  await screens.getByRole("link", { name: "World" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "World" })).toBeAttached()
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible()
})

test("can be installed, with its name and icons", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "The Salt Ledger" })).toBeVisible({ timeout: FIRST_LOAD_TIMEOUT })
  const href = await page.locator('link[rel="manifest"]').getAttribute("href")
  const manifest = (await (await page.request.get(href!)).json()) as {
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(manifest).toMatchObject({ name: "bookbookbook", display: "standalone", start_url: "/", scope: "/" })
  expect(manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose ?? "any"}`)).toEqual([
    "192x192 any",
    "512x512 any",
    "512x512 maskable",
  ])
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")
  for (const { src, sizes } of [...manifest.icons, { src: appleIcon!, sizes: "180x180" }]) {
    const png = await (await page.request.get(src)).body()
    // A PNG has its width and height in bytes 16 to 23.
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, src).toBe(sizes)
  }
  // Chrome's own checks, as for its Install button. It would offer to, but that the test's browser is a private one.
  const session = await page.context().newCDPSession(page)
  const installBlockers = async () =>
    (await session.send("Page.getInstallabilityErrors")).installabilityErrors.map(({ errorId }) => errorId)
  await expect.poll(installBlockers).toEqual(["in-incognito"])
})

test("a new version waits until the writer reloads, and what they'd just typed goes with them", async ({ page }) => {
  await firstVisit(page)
  // Opened again, as the first version now runs it.
  await page.reload()
  await expect.poll(() => runningVersion(page)).toBe("first")
  await publishNewVersion(page)
  await expect(updateToast(page)).toBeVisible()
  expect(await versionWaiting(page)).toBe(true)

  // Later: it waits, and asks again the next time the page opens.
  await updateToast(page).getByRole("button", { name: "Later" }).click()
  await expect(updateToast(page)).toBeHidden()
  await page.reload()
  await expect(updateToast(page)).toBeVisible()
  expect(await runningVersion(page)).toBe("first")

  await focusEnd(page.getByRole("textbox", { name: "Ferry wake" }))
  await page.keyboard.type(" The new version came.")
  const reloaded = page.waitForEvent("load")
  await updateToast(page).getByRole("button", { name: "Reload" }).click()
  await reloaded
  await expect.poll(() => runningVersion(page)).toBe("new")
  await expect(page.getByRole("textbox", { name: "Ferry wake" })).toContainText("The new version came.")
  await expect(updateToast(page)).toBeHidden()
  expect(await versionWaiting(page)).toBe(false)
})

test("reloading one tab into a new version reloads every tab into it", async ({ page, context }) => {
  await firstVisit(page)
  // Opened once the first version had taken over, so it runs this tab, but not the first, opened before.
  const other = await context.newPage()
  const otherErrors: string[] = []
  other.on("pageerror", (error) => otherErrors.push(error.message))
  other.on("console", (message) => {
    if (message.type() === "error") otherErrors.push(message.text())
  })
  await other.goto(page.url())
  await expect.poll(() => runningVersion(other)).toBe("first")
  expect(await runningVersion(page)).toBe("none")

  await publishNewVersion(page)
  await expect(updateToast(page)).toBeVisible()
  await expect(updateToast(other)).toBeVisible()
  await focusEnd(other.getByRole("textbox", { name: "Ferry wake" }))
  await other.keyboard.type(" Both tabs moved on.")
  const reloads = [page.waitForEvent("load"), other.waitForEvent("load")]
  await updateToast(page).getByRole("button", { name: "Reload" }).click()
  await Promise.all(reloads)

  for (const tab of [page, other]) {
    await expect.poll(() => runningVersion(tab)).toBe("new")
    await expect(tab.getByRole("textbox", { name: "Ferry wake" })).toContainText("Both tabs moved on.")
  }
  expect(otherErrors, "errors logged by the other tab").toEqual([])
})
