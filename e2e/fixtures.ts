import { test as base, expect, type Locator, type Page } from "@playwright/test"

/** What src/app/devHooks.ts puts on `window.__bbb` in development builds, which these tests run against. */
export interface DevHooks {
  db: {
    getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>
    execute(sql: string, parameters?: unknown[]): Promise<unknown>
  }
  openScenes(): string[]
  flushAll(): Promise<void>
  compactAll(): Promise<void>
  settleAll(): Promise<void>
  backUpNow(): Promise<"up-to-date" | "failed" | "skipped">
}

declare global {
  interface Window {
    __bbb: DevHooks
    /** The stand-in for the browser's voices that fakeSpeech puts in place. */
    __speech: { spoken: Spoken[]; finish(): void }
  }
}

/** What the app asked fakeSpeech's voices to say. */
export interface Spoken {
  text: string
  rate: number
  voice: string | null
}

interface EditorElement extends HTMLElement {
  editor: {
    commands: { focus(position?: "start" | "end"): boolean }
    chain(): { focus(): { setTextSelection(range: { from: number; to: number }): { run(): boolean } } }
    state: { doc: { descendants(visit: (node: { isText: boolean; text?: string }, pos: number) => void): void } }
  }
}

/** Fails any test whose page logs an error or throws. Each test gets a fresh profile, so the sample book seeds. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
      })
      await use(errors)
      expect(errors, "errors logged by the page").toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

/** The first load seeds the sample book, which can take a while when every worker does it at once. */
export const FIRST_LOAD_TIMEOUT = 20_000

/** Opens the app at "/", the home screen, and the sample book from it. */
export async function openSampleBook(page: Page) {
  await page.goto("/")
  await page.getByRole("link", { name: "The Salt Ledger" }).click({ timeout: FIRST_LOAD_TIMEOUT })
}

/** Opens the sample book from the home screen, at its first chapter. Returns the first scene's text box. */
export async function openFirstChapter(page: Page): Promise<Locator> {
  await openSampleBook(page)
  await expect(page).toHaveURL(/\/b\/[^/]+\/write\/[^/]+$/)
  const editor = page.getByRole("textbox", { name: "Ferry wake" })
  await expect(editor).toBeVisible()
  return editor
}

/** Puts the caret at the end of a scene. Clicking works too, but ProseMirror reads the new selection a task later. */
export async function focusEnd(editor: Locator) {
  await editor.evaluate((element) => (element as EditorElement).editor.commands.focus("end"))
  await expect(editor).toBeFocused()
}

/**
 * Selects `text` where a scene first has it, once the typing before has gone in. Shift+← works too, but under load a
 * key pressed while ProseMirror is still taking in the typing can go missing.
 */
export async function selectText(editor: Locator, text: string) {
  await expect
    .poll(() =>
      editor.evaluate((element, text) => {
        const { editor } = element as EditorElement
        let from = -1
        editor.state.doc.descendants((node, pos) => {
          const index = from < 0 && node.isText ? (node.text ?? "").indexOf(text) : -1
          if (index >= 0) from = pos + index
        })
        return from >= 0 && editor.chain().focus().setTextSelection({ from, to: from + text.length }).run()
      }, text),
    )
    .toBe(true)
  await expect(editor).toBeFocused()
  await expect.poll(() => editor.page().evaluate(() => window.getSelection()?.toString())).toBe(text)
}

/** Resolves once every edit in the page has been written to SQLite. */
export const flushAll = (page: Page) => page.evaluate(() => window.__bbb.flushAll())

/** Saves the pending word counts, daily stats and versions now, instead of after their delays. */
export const settleAll = (page: Page) => page.evaluate(() => window.__bbb.settleAll())

/** Reads from the page's database. */
export const queryDb = <T>(page: Page, sql: string, parameters: unknown[] = []) =>
  page.evaluate(({ sql, parameters }) => window.__bbb.db.getAll<T>(sql, parameters), { sql, parameters })

/** The open book's id, from the address. */
export const openBookId = (page: Page) => new URL(page.url()).pathname.split("/")[2]

/** Sets a device pref (`ui_prefs`), or with null, deletes it. */
export const setPref = (page: Page, key: string, value: string | null) =>
  page.evaluate(
    async ({ key, value }) => {
      const { db } = window.__bbb
      await db.execute("DELETE FROM ui_prefs WHERE id = ?", [key])
      if (value !== null) await db.execute("INSERT INTO ui_prefs (id, value) VALUES (?, ?)", [key, value])
    },
    { key, value },
  )

/**
 * Notes, as the backup checks would, that the open book was last backed up `last` days ago (null: never), and has
 * changed since `changed` days ago. Its fingerprint is one the book never has, so the checks find it changed still.
 */
export async function seedBackupRecord(page: Page, { last, changed }: { last: number | null; changed: number }) {
  const value = await page.evaluate(
    ({ last, changed }) => {
      // By the calendar, as the app counts days, so a change of clocks makes no difference.
      const daysAgo = (days: number) => {
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date.toISOString()
      }
      return JSON.stringify({
        last: last === null ? null : daysAgo(last),
        hash: "older",
        hashedAt: daysAgo(last ?? changed),
        dayWords: 0,
        changedAt: daysAgo(changed),
      })
    },
    { last, changed },
  )
  await setPref(page, `backup:${openBookId(page)}`, value)
}

/**
 * Puts a stand-in for speechSynthesis in place before the app loads, with two voices: Ann, on the device and its
 * default, and Bo, online. It notes what it's asked to say, and finishes saying it on `window.__speech.finish()`.
 */
export async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    type Handler = ((event: { error?: string }) => void) | null
    class Utterance {
      text: string
      rate = 1
      lang = ""
      voice: { voiceURI: string } | null = null
      onstart: Handler = null
      onend: Handler = null
      onerror: Handler = null
      constructor(text: string) {
        this.text = text
      }
    }
    const voices = [
      { voiceURI: "ann", name: "Ann", lang: "en-US", localService: true, default: true },
      { voiceURI: "bo", name: "Bo", lang: "en-US", localService: false, default: false },
    ]
    const spoken: Spoken[] = []
    let current: Utterance | null = null
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => voices,
      speak(utterance: Utterance) {
        spoken.push({ text: utterance.text, rate: utterance.rate, voice: utterance.voice?.voiceURI ?? null })
        current = utterance
        synth.speaking = true
        setTimeout(() => utterance.onstart?.({}))
      },
      // As Chrome does, what's cut off ends in an "interrupted" error.
      cancel() {
        const cut = current
        current = null
        synth.speaking = false
        if (cut) setTimeout(() => cut.onerror?.({ error: "interrupted" }))
      },
      pause() {},
      resume() {},
      addEventListener() {},
      removeEventListener() {},
    }
    const finish = () => {
      const done = current
      current = null
      synth.speaking = false
      done?.onend?.({})
    }
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true })
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true })
    Object.defineProperty(window, "__speech", { value: { spoken, finish } })
  })
}
