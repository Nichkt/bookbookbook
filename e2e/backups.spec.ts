import type { Page } from "@playwright/test"
import { strFromU8, unzipSync } from "fflate"
import { expect, focusEnd, openBookId, openFirstChapter, queryDb, seedBackupRecord, setPref, test } from "./fixtures"

const BACKUP_NAME = /^The Salt Ledger \d{4}-\d{2}-\d{2}\.bookbookbook\.zip$/

/** A folder picker that picks "Backups" in the page's private file system, as if the writer had chosen it. */
async function fakeFolderPicker(page: Page) {
  await page.addInitScript(() => {
    const showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle("Backups", { create: true })
    Object.assign(window, { showDirectoryPicker })
  })
}

/** The names of the files in the backup folder, or null if it has gone. */
const folderFiles = (page: Page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle("Backups").catch(() => null)
    if (!dir) return null
    const names: string[] = []
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name)
    return names.sort()
  })

/** The manuscript in a backup in the folder. */
async function manuscriptIn(page: Page, name: string) {
  const bytes = await page.evaluate(async (name) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Backups")
    const file = await (await dir.getFileHandle(name)).getFile()
    return Array.from(new Uint8Array(await file.arrayBuffer()))
  }, name)
  return strFromU8(unzipSync(new Uint8Array(bytes))["manuscript.md"])
}

const backUpNow = (page: Page) => page.evaluate(() => window.__bbb.backUpNow())

async function backupRecord(page: Page) {
  const rows = await queryDb<{ value: string }>(page, "SELECT value FROM ui_prefs WHERE id = ?", [
    `backup:${openBookId(page)}`,
  ])
  return JSON.parse(rows[0].value) as { last: string | null; changedAt: string | null }
}

/** The writer leaves the tab for a moment, and comes back. */
async function awayAndBack(page: Page, awayMs = 100) {
  await page.evaluate(async (awayMs) => {
    const show = (hidden: boolean) => {
      if (hidden) Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      else delete (document as { visibilityState?: unknown }).visibilityState
      document.dispatchEvent(new Event("visibilitychange"))
    }
    show(true)
    await new Promise((resolve) => setTimeout(resolve, awayMs))
    show(false)
  }, awayMs)
}

/** The browser takes back its permission to write to the folder, as Chrome does after five minutes away, till asked. */
const takeBackPermission = (page: Page) =>
  page.evaluate(() => {
    const handle = FileSystemDirectoryHandle.prototype as unknown as Record<string, unknown>
    handle.queryPermission = async () => "prompt"
    handle.requestPermission = async () => {
      delete handle.queryPermission
      delete handle.requestPermission
      return "granted"
    }
  })

/** Makes a book and opens it. Its reminder is decided on as it opens, well after the folder was first looked at. */
async function openNewBook(page: Page, title: string) {
  await page.getByRole("button", { name: /^Book: / }).click()
  await page.getByRole("menuitem", { name: "New book…" }).click()
  const dialog = page.getByRole("dialog", { name: "New book" })
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill(title)
  await dialog.getByRole("button", { name: "Create book" }).click()
  await expect(page.getByRole("button", { name: `Book: ${title}` })).toBeVisible()
}

/** Opens the book menu, and returns the Backups item, which says when the book was last backed up. */
async function backupsItem(page: Page) {
  await page.getByRole("button", { name: /^Book: / }).click()
  return page.getByRole("menuitem", { name: /^Backups…/ })
}

async function openBackups(page: Page) {
  await (await backupsItem(page)).click()
  const dialog = page.getByRole("dialog", { name: "Backups" })
  await expect(dialog).toBeVisible()
  return dialog
}

const reminderOf = (page: Page) => page.getByRole("region", { name: "Backup reminder" })

test("reminds the writer of a book changed a week and more since its last backup, and backs it up", async ({
  page,
}) => {
  await fakeFolderPicker(page)
  await openFirstChapter(page)
  await seedBackupRecord(page, { last: 20, changed: 10 })
  await page.reload()
  const reminder = reminderOf(page)
  await expect(reminder).toContainText("“The Salt Ledger” was last backed up 20 days ago, and has changed since.")
  await expect(reminder.getByRole("button")).toHaveText(["Back up now", "Back up to a folder…", "Not now"])

  await expect(await backupsItem(page)).toContainText("Last backup: 20 days ago")
  await page.keyboard.press("Escape")

  const downloading = page.waitForEvent("download")
  await reminder.getByRole("button", { name: "Back up now" }).click()
  const name = (await downloading).suggestedFilename()
  expect(name).toMatch(BACKUP_NAME)
  await expect(page.getByText(`Downloaded “${name}”`)).toBeVisible()
  await expect(reminder).toBeHidden()
  await expect(page.getByRole("button", { name: "Navigator" })).toBeFocused()
  expect(await backupRecord(page)).toMatchObject({ changedAt: null })

  const dialog = await openBackups(page)
  await expect(dialog.getByRole("region", { name: "This book" })).toContainText("Last backed up today at")
  await page.keyboard.press("Escape")
  await expect(await backupsItem(page)).toContainText("Last backup: Today")
})

test("puts the reminder off for a week with Not now", async ({ page }) => {
  await openFirstChapter(page)
  await seedBackupRecord(page, { last: null, changed: 10 })
  await page.reload()
  const reminder = reminderOf(page)
  await expect(reminder).toContainText("“The Salt Ledger” has never been backed up. Its only copy is in this browser.")

  await reminder.getByRole("button", { name: "Not now" }).click()
  await expect(reminder).toBeHidden()
  await expect(page.getByRole("button", { name: "Navigator" })).toBeFocused()
  const key = `backup.snooze:${openBookId(page)}`
  const [snooze] = await queryDb<{ value: string }>(page, "SELECT value FROM ui_prefs WHERE id = ?", [key])
  const days = (Date.parse(snooze.value) - Date.now()) / (24 * 60 * 60 * 1000)
  expect(days).toBeGreaterThan(6.99)
  expect(days).toBeLessThanOrEqual(7)
  await awayAndBack(page)
  await expect(reminder).toBeHidden()

  // The week is up. The reminder waits till the writer is back, rather than come mid-sentence.
  await setPref(page, key, new Date(Date.now() - 60_000).toISOString())
  await expect(reminder).toBeHidden()
  await awayAndBack(page)
  await expect(reminder).toContainText("has never been backed up")
})

test("a reminder that falls due mid-session waits till the writer comes back", async ({ page }) => {
  await openFirstChapter(page)
  await openNewBook(page, "Blank Pages")
  await expect(await backupsItem(page)).toContainText("Last backup: Never")
  await page.keyboard.press("Escape")

  await seedBackupRecord(page, { last: 20, changed: 10 })
  await expect(await backupsItem(page)).toContainText("Last backup: 20 days ago")
  await page.keyboard.press("Escape")
  // A pass looks at the folder again, which mustn't bring the reminder mid-session.
  expect(await backUpNow(page)).toBe("skipped")
  const reminder = reminderOf(page)
  await expect(reminder).toBeHidden()
  await awayAndBack(page)
  await expect(reminder).toContainText("“Blank Pages” was last backed up 20 days ago, and has changed since.")
})

test("without folder backups, a reminder that falls due while the writer is away is there when they're back", async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(window, "showDirectoryPicker", { value: undefined }))
  await openFirstChapter(page)
  // Time passes between the page's listeners, as when the browser updates the page between them: here after the
  // scheduler's, which looks at the folder at once in a browser without folder backups, and before the reminder's,
  // registered as the next book opens.
  await page.evaluate(() =>
    document.addEventListener("visibilitychange", () => {
      const until = performance.now() + 5
      while (performance.now() < until);
    }),
  )
  await openNewBook(page, "Blank Pages")
  await seedBackupRecord(page, { last: 20, changed: 10 })
  // Put off till just after the writer leaves.
  await setPref(page, `backup.snooze:${openBookId(page)}`, new Date(Date.now() + 1000).toISOString())
  const reminder = reminderOf(page)
  await expect(reminder).toBeHidden()
  await awayAndBack(page, 2000)
  await expect(reminder).toContainText("“Blank Pages” was last backed up 20 days ago, and has changed since.")
  await expect(reminder.getByRole("button")).toHaveText(["Back up now", "Not now"])
})

test("backs every book up to a folder, keeps the backup up to date, and stops", async ({ page }) => {
  await fakeFolderPicker(page)
  const editor = await openFirstChapter(page)
  const dialog = await openBackups(page)
  const folder = dialog.getByRole("region", { name: "Folder backups" })
  await folder.getByRole("button", { name: "Choose a folder…" }).click()
  await expect(page.getByText("Backed up every book to “Backups”")).toBeVisible()
  await expect(folder).toContainText("Every book is backed up to “Backups” within the hour when it changes")
  await expect(folder.getByText(/^Up to date as of today at /)).toBeVisible()
  await expect(folder.getByRole("button", { name: "Change folder…" })).toBeFocused()
  await expect(dialog.getByRole("region", { name: "This book" })).toContainText("Last backed up today at")
  const files = await folderFiles(page)
  expect(files).toEqual([expect.stringMatching(BACKUP_NAME)])
  await page.keyboard.press("Escape")

  // A pass replaces the day's backup with one that has the new words.
  await focusEnd(editor)
  await page.keyboard.type(" The gulls followed.")
  expect(await backUpNow(page)).toBe("up-to-date")
  expect(await folderFiles(page)).toEqual(files)
  expect(await manuscriptIn(page, files![0])).toContain("The gulls followed.")
  expect(await backupRecord(page)).toMatchObject({ changedAt: null })

  await openBackups(page)
  await folder.getByRole("button", { name: "Stop" }).click()
  await expect(page.getByText("Stopped backing up to “Backups”. The backups there stay.")).toBeVisible()
  await expect(folder.getByRole("button", { name: "Choose a folder…" })).toBeFocused()
  expect(await folderFiles(page)).toEqual(files)
})

test("asks again when the browser pauses folder backups, and for a new folder when it's gone", async ({ page }) => {
  await fakeFolderPicker(page)
  const editor = await openFirstChapter(page)
  const dialog = await openBackups(page)
  const folder = dialog.getByRole("region", { name: "Folder backups" })
  await folder.getByRole("button", { name: "Choose a folder…" }).click()
  await expect(page.getByText("Backed up every book to “Backups”")).toBeVisible()
  await page.keyboard.press("Escape")

  await takeBackPermission(page)
  await focusEnd(editor)
  await page.keyboard.type(" The gulls followed.")
  expect(await backUpNow(page)).toBe("skipped")
  await openBackups(page)
  const paused = "Backups to “Backups” are paused: the browser needs your permission to write there again."
  await expect(folder).toContainText(paused)
  await expect(folder.getByRole("button")).toHaveText(["Allow", "Change folder…", "Stop"])
  await page.keyboard.press("Escape")

  const reminder = reminderOf(page)
  await expect(reminder).toBeHidden()
  await awayAndBack(page)
  await expect(reminder).toContainText(paused)
  await reminder.getByRole("button", { name: "Allow" }).click()
  await expect(page.getByText("Backing up to “Backups” again")).toBeVisible()
  await expect(reminder).toBeHidden()
  expect(await manuscriptIn(page, (await folderFiles(page))![0])).toContain("The gulls followed.")

  await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("Backups", { recursive: true }))
  await focusEnd(editor)
  await page.keyboard.type(" Then the rain.")
  expect(await backUpNow(page)).toBe("failed")
  await openBackups(page)
  const stopped = "Backups to “Backups” have stopped: the folder has been moved, renamed or deleted."
  await expect(folder).toContainText(stopped)
  await expect(folder.getByRole("button")).toHaveText(["Try again", "Choose a folder…", "Stop"])
  await page.keyboard.press("Escape")

  await awayAndBack(page)
  await expect(reminder).toContainText(stopped)
  await reminder.getByRole("button", { name: "Choose a folder…" }).click()
  // The reminder goes once there's a folder; the backup follows.
  await expect(reminder).toBeHidden()
  await expect.poll(async () => (await backupRecord(page)).changedAt).toBeNull()
  const files = await folderFiles(page)
  expect(files).toEqual([expect.stringMatching(BACKUP_NAME)])
  expect(await manuscriptIn(page, files![0])).toContain("Then the rain.")
})

test("keeps focus in the reminder while its folder backup runs, and passes it on as the reminder goes", async ({
  page,
}) => {
  await fakeFolderPicker(page)
  const editor = await openFirstChapter(page)
  await seedBackupRecord(page, { last: 20, changed: 10 })
  await page.reload()
  const reminder = reminderOf(page)
  const navigator = page.getByRole("button", { name: "Navigator" })
  // Folder backups come on before they've written the backup, which leaves the book a reminder of its own till then.
  await reminder.getByRole("button", { name: "Back up to a folder…" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("Backed up every book to “Backups”")).toBeVisible()
  await expect(reminder).toBeHidden()
  await expect(navigator).toBeFocused()

  // As they do when they're allowed again.
  await takeBackPermission(page)
  await focusEnd(editor)
  await page.keyboard.type(" The gulls followed.")
  await seedBackupRecord(page, { last: 20, changed: 10 })
  expect(await backUpNow(page)).toBe("skipped")
  await awayAndBack(page)
  await expect(reminder).toContainText("Backups to “Backups” are paused")
  await reminder.getByRole("button", { name: "Allow" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("Backing up to “Backups” again")).toBeVisible()
  await expect(reminder).toBeHidden()
  await expect(navigator).toBeFocused()
  expect(await backupRecord(page)).toMatchObject({ changedAt: null })
})

test("moves focus within the reminder when its focused button goes, but leaves focus that has moved on", async ({
  page,
}) => {
  await fakeFolderPicker(page)
  await openFirstChapter(page)
  const dialog = await openBackups(page)
  await dialog.getByRole("region", { name: "Folder backups" }).getByRole("button", { name: "Choose a folder…" }).click()
  await expect(page.getByText("Backed up every book to “Backups”")).toBeVisible()
  await page.keyboard.press("Escape")
  // Folder backups are on, but somehow haven't backed up a week's changes.
  await seedBackupRecord(page, { last: 20, changed: 10 })
  await page.reload()
  const reminder = reminderOf(page)
  await expect(reminder.getByRole("button")).toHaveText(["Back up now", "Not now"])
  await reminder.getByRole("button", { name: "Back up now" }).focus()

  await takeBackPermission(page)
  expect(await backUpNow(page)).toBe("skipped")
  await expect(reminder).toContainText("Backups to “Backups” are paused")
  await expect(reminder.getByRole("button", { name: "Allow" })).toBeFocused()

  await reminder.getByText("Backups to “Backups” are paused").click()
  await page.evaluate(async () => {
    const handle = FileSystemDirectoryHandle.prototype as unknown as Record<string, unknown>
    delete handle.queryPermission
    delete handle.requestPermission
    await (await navigator.storage.getDirectory()).removeEntry("Backups", { recursive: true })
  })
  expect(await backUpNow(page)).toBe("failed")
  await expect(reminder).toContainText("Backups to “Backups” have stopped")
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
})
