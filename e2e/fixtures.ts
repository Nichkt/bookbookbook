import { test as base, expect, type Locator, type Page } from "@playwright/test"

/** What src/app/devHooks.ts puts on `window.__bbb` in development builds, which these tests run against. */
export interface DevHooks {
  db: {
    getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>
    execute(sql: string, parameters?: unknown[]): Promise<unknown>
    /** Runs `hold` with the database to itself: the app's writes wait until it resolves. */
    writeLock<T>(hold: () => Promise<T>): Promise<T>
  }
  openScenes(): string[]
  flushAll(): Promise<void>
  compactAll(): Promise<void>
  settleAll(): Promise<void>
  backUpNow(): Promise<"up-to-date" | "failed" | "skipped">
  setTheme(theme: "light" | "sepia" | "dark"): void
}

declare global {
  interface Window {
    __bbb: DevHooks
    /** The stand-in for the browser's voices that fakeSpeech puts in place. */
    __speech: { spoken: Spoken[]; finish(): void }
    /** The stand-in for speech recognition that fakeDictation puts in place. */
    __dictation: FakeDictation
    /** What offerInstall's stand-in for the browser's offer to install has seen. */
    __install: FakeInstall
    /** Opens fakeKeyboard's stand-in for an on-screen keyboard, `height` pixels tall, or with 0, puts it away. */
    __keyboard(height: number): void
  }
}

/** How a test answers for the writer through offerInstall. */
export interface FakeInstall {
  /** Whether the app kept the offer for itself, so the browser shows no banner of its own. */
  kept: boolean
  /** How many times the app has shown the browser's dialog. */
  prompted: number
  /** Answers the dialog, as the writer would. Accepting installs the app, as the browser then announces. */
  answer(outcome: "accepted" | "dismissed"): void
}

/** What the app asked fakeSpeech's voices to say. */
export interface Spoken {
  text: string
  rate: number
  voice: string | null
}

/** How a test speaks to the app through fakeDictation. */
export interface FakeDictation {
  /** Whether the app has the microphone on. */
  listening(): boolean
  /** How the app last started listening. */
  started: { lang: string; onDevice: boolean } | null
  /** Hears `text` still being spoken: shown, not yet typed. */
  hear(text: string): void
  /** Hears `text` and settles it, so it's typed. */
  say(text: string): void
}

interface EditorElement extends HTMLElement {
  editor: {
    commands: { focus(position?: "start" | "end"): boolean }
    chain(): { focus(): { setTextSelection(range: { from: number; to: number }): { run(): boolean } } }
    state: { doc: { descendants(visit: (node: { isText: boolean; text?: string }, pos: number) => void): void } }
  }
}

/**
 * Chrome's note that Vite's live-reload socket was turned away, as a dev server busy with every worker's page can do.
 * Vite tries again directly, logging its own error should that fail too. The app has no sockets of its own.
 */
const DEV_SERVER_SOCKET = /^WebSocket connection to 'ws:\/\/localhost:\d+\/\?token=[^']*' failed/

/** Fails any test whose page logs an error or throws. Each test gets a fresh profile, so the sample book seeds. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error" && !DEV_SERVER_SOCKET.test(message.text())) errors.push(message.text())
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

/** Lets open and close animations finish, so nothing is measured mid-zoom. Endless ones (spinners) don't count. */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running" || animation.effect?.getComputedTiming().endTime === Infinity),
  )
}

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

/**
 * Puts a stand-in for speech recognition in place before the app loads, ready to recognize any language on the
 * device. The test speaks through `window.__dictation` (see FakeDictation).
 */
export async function fakeDictation(page: Page) {
  await page.addInitScript(() => {
    interface Heard {
      transcript: string
      isFinal: boolean
    }
    const live: { recognition: Recognition | null } = { recognition: null }
    class Recognition {
      lang = ""
      continuous = false
      interimResults = false
      processLocally = false
      onstart: (() => void) | null = null
      onresult: ((event: unknown) => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      heard: Heard[] = []
      static available = () => Promise.resolve("available")
      static install = () => Promise.resolve(true)
      start() {
        live.recognition = this
        dictation.started = { lang: this.lang, onDevice: this.processLocally }
        setTimeout(() => this.onstart?.())
      }
      stop() {
        this.end()
      }
      abort() {
        this.end()
      }
      end() {
        if (live.recognition === this) live.recognition = null
        setTimeout(() => this.onend?.())
      }
      /** Hears more, replacing what was still being heard. */
      hear(transcript: string, isFinal: boolean) {
        const last = this.heard.at(-1)
        const index = last && !last.isFinal ? this.heard.length - 1 : this.heard.length
        this.heard[index] = { transcript, isFinal }
        const results = this.heard.map((heard) => Object.assign([{ transcript: heard.transcript }], heard))
        this.onresult?.({ resultIndex: index, results })
      }
    }
    const listener = () => {
      if (!live.recognition) throw new Error("The app isn't listening.")
      return live.recognition
    }
    const dictation = {
      listening: () => live.recognition !== null,
      started: null as { lang: string; onDevice: boolean } | null,
      hear: (text: string) => listener().hear(text, false),
      say: (text: string) => listener().hear(text, true),
    }
    Object.defineProperty(window, "SpeechRecognition", { value: Recognition, configurable: true })
    Object.defineProperty(window, "__dictation", { value: dictation })
  })
}

/**
 * Puts a stand-in for an on-screen keyboard in place before the app loads, as these tests' browsers never show one.
 * `window.__keyboard(height)` opens it: the visual viewport loses that much from its bottom while the window keeps its
 * height, as in Chrome on Android and Safari on iOS (DESIGN.md §16).
 */
export async function fakeKeyboard(page: Page) {
  await page.addInitScript(() => {
    const real = window.visualViewport
    if (!real) throw new Error("This browser has no visual viewport.")
    let keyboard = 0
    const viewport = new Proxy(real, {
      get(target, key) {
        if (key === "height") return Math.max(0, target.height - keyboard)
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    Object.defineProperty(window, "visualViewport", { get: () => viewport, configurable: true })
    Object.defineProperty(window, "__keyboard", {
      value: (height: number) => {
        keyboard = height
        real.dispatchEvent(new Event("resize"))
      },
    })
  })
}

/**
 * Makes the offer to install the app that Chrome and Edge make once it can be installed, which they never do for
 * these tests' browser profiles (DESIGN.md §11). The test answers for the writer through `window.__install`.
 */
export async function offerInstall(page: Page) {
  await page.evaluate(() => {
    let choose: (outcome: "accepted" | "dismissed") => void = () => undefined
    const userChoice = new Promise<{ outcome: string; platform: string }>((resolve) => {
      choose = (outcome) => resolve({ outcome, platform: "web" })
    })
    const install: FakeInstall = {
      kept: false,
      prompted: 0,
      answer(outcome) {
        choose(outcome)
        if (outcome === "accepted") setTimeout(() => window.dispatchEvent(new Event("appinstalled")))
      },
    }
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        install.prompted++
      },
      userChoice,
    })
    Object.defineProperty(window, "__install", { value: install, configurable: true })
    window.dispatchEvent(offer)
    install.kept = offer.defaultPrevented
  })
}

/** Where a model on this computer listens: Ollama's address, which AI settings starts with. */
export const LOCAL_AI = "http://localhost:11434/v1"

/** A chat request, as the AI tools send it to every provider but Anthropic (DESIGN.md §9 "Providers"). */
export interface ChatBody {
  model: string
  stream: boolean
  messages: { role: string; content: string }[]
  max_tokens?: number
  max_completion_tokens?: number
  reasoning_effort?: string
}

/** A chat request fakeAi took. */
export interface SentChat {
  url: string
  headers: Record<string, string>
  body: ChatBody
}

/** An answer as OpenAI's API streams it: a few characters at a time, then why it stopped, then the end. */
function eventStream(text: string) {
  const pieces = text.match(/[\s\S]{1,8}/g) ?? []
  const events = [
    ...pieces.map((piece) => ({ choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })),
    { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ]
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`
}

interface FakeAiOptions {
  /** What it lists as its models. */
  models?: string[]
  /** The key it takes; without one, it takes any request. */
  key?: string
}

/**
 * Stands in for an AI model at `base`, answering as Ollama, LM Studio and OpenAI all do. It notes each chat request,
 * and answers with the replies queued, in the order the requests come, else "The tide turned.".
 */
export async function fakeAi(
  page: Page,
  base: string,
  { models = ["llama3.1", "nomic-embed-text"], key }: FakeAiOptions = {},
) {
  const sent: SentChat[] = []
  const replies: string[] = []
  let held: Promise<void> | null = null
  let letGo = () => {}
  await page.route(
    (url) => url.href.startsWith(`${base}/`),
    async (route) => {
      const request = route.request()
      const headers = await request.allHeaders()
      const cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": headers["access-control-request-headers"] ?? "authorization, content-type",
      }
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors })
      const json = (status: number, body: unknown) =>
        route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) })
      const keyOk = !key || headers.authorization === `Bearer ${key}`
      const wrongKey = { error: { message: "Incorrect API key provided.", type: "invalid_request_error" } }
      if (request.method() === "GET") {
        if (!keyOk) return json(401, wrongKey)
        return json(200, { object: "list", data: models.map((id) => ({ id, object: "model" })) })
      }
      sent.push({ url: request.url(), headers, body: request.postDataJSON() as ChatBody })
      if (!keyOk) return json(401, wrongKey)
      const reply = replies.shift() ?? "The tide turned."
      if (held) await held
      // A run stopped while it waited is gone by now.
      await route
        .fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body: eventStream(reply) })
        .catch(() => {})
    },
  )
  return {
    sent,
    /** Queues answers, one for each request to come. */
    reply: (...texts: string[]) => {
      replies.push(...texts)
    },
    /** Keeps answers back until release(). */
    hold: () => {
      held = new Promise<void>((resolve) => {
        letGo = resolve
      })
    },
    release: () => {
      held = null
      letGo()
    },
  }
}

/** Sets the AI tools up for llama3.1 on this computer, as AI settings would, with room for the chapter's plan. */
export const setUpLocalAi = (page: Page) => {
  const local = { model: "llama3.1", baseUrl: LOCAL_AI, contextTokens: 8000 }
  return setPref(page, "ai.settings", JSON.stringify({ provider: "local", choices: { local } }))
}
