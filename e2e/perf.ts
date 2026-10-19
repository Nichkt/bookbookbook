import { readFile } from "node:fs/promises"
import { cpus } from "node:os"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { chromium, type Locator, type Page } from "@playwright/test"
import { build, preview, type Manifest } from "vite"

/*
 * Measures bookbookbook against its performance budgets (DESIGN.md §17) with a book of over 150,000 words:
 * `npm run perf`, or `npm run perf -- 4` with the CPU slowed fourfold, as on a low-end laptop.
 *
 * It builds the app for production and serves the build, then in the installed Chrome imports the book through Import a
 * manuscript, types in a chapter, opens chapters from the navigator, scrolls the Manuscript and types in it, drags a
 * card across the Board, and opens the home screen. The JavaScript the home screen needs is counted from the build.
 */

// `npm run preview` uses 4173, and the offline tests 4174.
const PORT = 4175
const slowdown = Number(process.argv[2] ?? 1)
/** A frame at 60 Hz, 16.7 ms, and a little for the timer's jitter. */
const FRAME_MS = 18
/** A gap between frames long enough that one was missed. */
const MISSED_MS = 25

interface Row {
  measure: string
  result: string
  budget?: string
  within?: boolean
}

interface Perf {
  /** Starts timing each key pressed, from the press to the paint that shows it. */
  startKeys(): void
  stopKeys(): number[]
  /** Starts timing the gaps between frames. */
  startFrames(): void
  stopFrames(): number[]
  /** Resolves with the milliseconds from `since` to the paint of the first frame in which `ready()` holds. */
  until(ready: () => boolean, since: number): Promise<number>
}

declare global {
  interface Window {
    __perf: Perf
  }
}

/** The long book's words. */
const WORDS = (
  "the a and of to in was he she it that with his her for on at as by from they had but not this be were " +
  "water harbour ferry tide salt ledger island boat rope gull fog wind house door window lamp night morning " +
  "dark light cold warm old young hand face eyes voice letter book page ink name road hill stone shore sea " +
  "said asked looked turned walked waited thought knew felt heard saw found kept left took gave held pulled " +
  "slowly quietly again still almost never always perhaps only even just already once later soon " +
  "Mara Elias Jonas Wren the keeper the clerk the captain Mrs Hale Tobin Ansel"
).split(" ")

const book = longBook()
const rows: Row[] = []

const computer = cpus()[0]?.model.trim() ?? "this computer"
console.log(
  `Measuring with a book of ${book.words.toLocaleString("en-US")} words on ${computer}` +
    (slowdown > 1 ? `, slowed ${slowdown} times.` : "."),
)
await build({ logLevel: "error", build: { manifest: true } })
const server = await preview({ logLevel: "error", preview: { port: PORT, strictPort: true } })
const browser = await chromium.launch({ channel: "chrome" })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on("pageerror", (error) => console.error("Error in the page:", error.message))
  // The app shows its own error should the database not open, and logs why.
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Error in the page:", message.text())
  })
  await page.addInitScript(instrument)
  await page.goto(`http://localhost:${PORT}/`)
  await page.getByRole("button", { name: "Import a manuscript", exact: true }).waitFor()
  if (slowdown > 1) {
    const devtools = await page.context().newCDPSession(page)
    await devtools.send("Emulation.setCPUThrottlingRate", { rate: slowdown })
  }
  await importBook(page)
  await typeInChapter(page)
  await openChapters(page)
  await scrollAndTypeInManuscript(page)
  await dragOnBoard(page)
  await openHome(page)
} finally {
  await browser.close()
  await server.close()
}
rows.push(await startupScripts())
print(rows)

/** Imports the long book through Import a manuscript, which opens it on Write. */
async function importBook(page: Page) {
  await page.getByRole("button", { name: "Import a manuscript", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Import a manuscript" })
  const started = Date.now()
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "long-book.md", mimeType: "text/markdown", buffer: Buffer.from(book.markdown) })
  await dialog.getByText(/^\d+ chapters · /).waitFor({ timeout: 120_000 })
  const read = Date.now() - started
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  await page.waitForURL(/\/write\//, { timeout: 300_000 })
  await page.getByRole("textbox", { name: "Scene 1", exact: true }).waitFor({ timeout: 120_000 })
  const wrote = Date.now() - started - read
  rows.push({ measure: "Import the book", result: `${seconds(read)} to read it, ${seconds(wrote)} to write it` })
}

/** Types at the end of the first chapter, shown whole. */
async function typeInChapter(page: Page) {
  await page.getByRole("radio", { name: "Chapter" }).click()
  await page.waitForTimeout(1_500)
  await page.getByRole("textbox", { name: "Scene 1", exact: true }).click()
  await page.keyboard.press("Control+End")
  await page.waitForTimeout(1_000)
  const sentence = " The quick brown fox jumps over the lazy dog as the tide comes in."
  const keys = spread(await typeTimed(page, sentence.repeat(3)))
  rows.push({
    measure: "Keystroke to paint",
    result: `median ${ms(keys.median)}, 95% within ${ms(keys.p95)}`,
    budget: "16 ms",
    within: keys.median < 16,
  })
}

/** Opens chapters from the navigator, from all over the book. */
async function openChapters(page: Page) {
  const opens: number[] = []
  for (const number of [50, 12, 87, 33, 66, 99, 5, 71]) {
    const link = page.getByRole("link", { name: new RegExp(`^Chapter ${number}: `) })
    await link.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    opens.push(await timeClick(page, link, { prose: book.openings[number - 1] }))
    await page.waitForTimeout(600)
  }
  const { median, most } = spread(opens)
  rows.push({
    measure: "Open a chapter",
    result: `median ${ms(median)}, slowest ${ms(most)}`,
    budget: "150 ms",
    within: most < 150,
  })
}

/** Scrolls down the Manuscript, all 100 chapters on one page, then types in it and pauses as it saves. */
async function scrollAndTypeInManuscript(page: Page) {
  await page.getByRole("radio", { name: "Manuscript" }).click()
  await page.waitForTimeout(2_500)
  await page.mouse.move(640, 450)
  await page.evaluate(() => window.__perf.startFrames())
  for (let notch = 0; notch < 240; notch++) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(300)
  rows.push(smoothness("Scroll the Manuscript", await page.evaluate(() => window.__perf.stopFrames())))

  await page.mouse.click(640, 420)
  await page.keyboard.press("End")
  await page.waitForTimeout(1_500)
  await page.evaluate(() => window.__perf.startFrames())
  const keys = spread(await typeTimed(page, " The tide comes in over the salt flats."))
  // The word count saves after a pause, and the plan changes under the whole book.
  await page.waitForTimeout(3_000)
  const frames = spread(await page.evaluate(() => window.__perf.stopFrames()))
  rows.push({
    measure: "Type in the Manuscript",
    result: `median ${ms(keys.median)}, 95% within ${ms(keys.p95)}; slowest frame ${ms(frames.most)}`,
    budget: "16 ms",
    within: keys.median < 16,
  })
}

/** Opens the Board, with a card for each of the 100 chapters, and drags a card a few places on. */
async function dragOnBoard(page: Page) {
  await page.getByRole("navigation", { name: "Screens" }).getByRole("link", { name: "Plan" }).click()
  const views = page.getByRole("navigation", { name: "Plan views" })
  await views.getByRole("link", { name: "Outline" }).click()
  await page.waitForTimeout(1_500)
  const opened = await timeClick(page, views.getByRole("link", { name: "Board", exact: true }), { cards: 100 })
  rows.push({ measure: "Open the Board", result: ms(opened) })
  await page.waitForTimeout(1_500)

  const cards = page.locator("li[data-chapter-card]")
  const from = await cards.nth(1).boundingBox()
  const to = await cards.nth(5).boundingBox()
  if (!from || !to) throw new Error("The Board's cards aren't showing.")
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  await page.evaluate(() => window.__perf.startFrames())
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const steps = 60
  for (let step = 1; step <= steps; step++) {
    // Wavering on the way, as a hand does.
    const x = start.x + ((to.x - from.x) * step) / steps
    const y = start.y + ((to.y - from.y) * step) / steps + Math.sin(step / 4) * 30
    await page.mouse.move(x, y)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
  rows.push(smoothness("Drag a card on the Board", await page.evaluate(() => window.__perf.stopFrames())))
}

/** Opens the home screen afresh, timed until the long book is on it. */
async function openHome(page: Page) {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "commit" })
  const shown = await page.evaluate(() => {
    const listed = () => Array.from(document.links).some((link) => link.textContent?.includes("The Long Book"))
    return window.__perf.until(listed, 0)
  })
  rows.push({ measure: "Open the home screen", result: ms(shown) })
}

/** The JavaScript the splash needs, then the home screen, gzipped as a server would send it. */
async function startupScripts(): Promise<Row> {
  const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8")) as Manifest
  const files = new Set<string>()
  const add = (key: string) => {
    const { file, imports = [] } = manifest[key]
    if (files.has(file)) return
    files.add(file)
    imports.forEach(add)
  }
  const gzipped = async () => {
    let bytes = 0
    for (const file of files) bytes += gzipSync(await readFile(path.join("dist", file))).length
    return bytes
  }
  // main.tsx shows the splash, then fetches the router, which has the home screen.
  add("index.html")
  const splash = await gzipped()
  add("src/app/router.tsx")
  const home = await gzipped()
  return {
    measure: "JavaScript to the home screen",
    result: `${kb(home)} gzipped, ${kb(splash)} of it for the splash`,
    budget: "250 KB",
    within: home < 250 * 1024,
  }
}

/** Types `text` a key at a time, as a quick typist would, and returns how long each key took to show. */
async function typeTimed(page: Page, text: string) {
  await page.evaluate(() => window.__perf.startKeys())
  await page.keyboard.type(text, { delay: 70 })
  await page.waitForTimeout(500)
  return page.evaluate(() => window.__perf.stopKeys())
}

/** Clicks `target`, and resolves with the milliseconds from the click to the paint that shows the prose or cards. */
async function timeClick(page: Page, target: Locator, shown: { prose?: string; cards?: number }) {
  const timing = await page.evaluateHandle(({ prose, cards = 0 }) => {
    const editors = () => Array.from(document.querySelectorAll(".ProseMirror"))
    const ready =
      prose === undefined
        ? () => document.querySelectorAll("li[data-chapter-card]").length >= cards
        : () => editors().some((text) => text.textContent?.startsWith(prose))
    const done = new Promise<number>((resolve) => {
      const clicked = (event: MouseEvent) => void window.__perf.until(ready, event.timeStamp).then(resolve)
      addEventListener("click", clicked, { capture: true, once: true })
    })
    return { done }
  }, shown)
  await target.click()
  return page.evaluate((timing) => timing.done, timing)
}

/** Runs in the page ahead of the app, to time what the writer sees. */
function instrument() {
  // A message posted as a frame is drawn arrives once it's been painted.
  const afterPaint = (then: () => void) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => then()
    channel.port2.postMessage(null)
  }
  let keys: number[] | undefined
  let frames: number[] | undefined
  addEventListener(
    "keydown",
    (event) => {
      const times = keys
      if (times) requestAnimationFrame(() => afterPaint(() => times.push(performance.now() - event.timeStamp)))
    },
    { capture: true },
  )
  const tick = (time: number) => {
    if (!frames) return
    frames.push(time)
    requestAnimationFrame(tick)
  }
  window.__perf = {
    startKeys() {
      keys = []
    },
    stopKeys() {
      const times = keys ?? []
      keys = undefined
      return times
    },
    startFrames() {
      frames = []
      requestAnimationFrame(tick)
    },
    stopFrames() {
      const times = frames ?? []
      frames = undefined
      return times.slice(1).map((time, i) => time - times[i])
    },
    until(ready, since) {
      return new Promise((resolve) => {
        const look = () => {
          if (ready()) afterPaint(() => resolve(performance.now() - since))
          else requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      })
    },
  }
}

/** A row for something held to 60 fps: 95% of its frames drawn in time. */
function smoothness(measure: string, gaps: number[]): Row {
  const { p95, most } = spread(gaps)
  const missed = gaps.filter((gap) => gap > MISSED_MS).length
  return {
    measure,
    result: `95% of frames within ${ms(p95)}, slowest ${ms(most)}, ${missed} of ${gaps.length} late`,
    budget: "60 fps",
    within: p95 <= FRAME_MS,
  }
}

/** The median, the 95th percentile and the largest of `values`. */
function spread(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? NaN
  return { median: at(0.5), p95: at(0.95), most: at(1) }
}

function ms(value: number) {
  return `${value < 20 ? value.toFixed(1) : Math.round(value)} ms`
}

function seconds(value: number) {
  return `${(value / 1000).toFixed(1)} s`
}

function kb(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`
}

function print(table: Row[]) {
  const lines = [
    ["", "Result", "Budget", ""],
    ...table.map((row) => [
      row.measure,
      row.result,
      row.budget ?? "",
      row.within === undefined ? "" : row.within ? "within" : "OVER",
    ]),
  ]
  const widths = lines[0].map((_, column) => Math.max(...lines.map((cells) => cells[column].length)))
  console.log()
  for (const cells of lines) console.log(cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd())
}

/**
 * A novel's worth of made-up prose, the same every run: 100 chapters in three parts, two or three scenes to a chapter
 * and about 1,600 words to a chapter. Returns it as Markdown, with its length in words and how each chapter opens.
 */
function longBook() {
  const random = seeded(42)
  const pick = () => WORDS[Math.floor(random() * WORDS.length)]
  const sentence = () => {
    const text = Array.from({ length: 6 + Math.floor(random() * 16) }, pick).join(" ")
    return text[0].toUpperCase() + text.slice(1) + (random() < 0.1 ? "?" : ".")
  }
  const paragraph = (length: number) => {
    const sentences: string[] = []
    for (let count = 0; count < length; ) {
      const next = sentence()
      sentences.push(next)
      count += next.split(" ").length
    }
    const text = sentences.join(" ")
    return random() < 0.15 ? `“${text}” she said.` : text
  }

  const parts = ["# The Long Book\n\nby Perf Tester\n"]
  const openings: string[] = []
  let words = 0
  for (let chapter = 1; chapter <= 100; chapter++) {
    if (chapter === 1) parts.push("# Part One\n")
    if (chapter === 34) parts.push("# Part Two\n")
    if (chapter === 67) parts.push("# Part Three\n")
    const title = sentence().split(" ").slice(0, 3).join(" ").replace(/[.?]$/, "")
    parts.push(`## Chapter ${chapter}: ${title}\n`)
    const scenes = random() < 0.5 ? 2 : 3
    for (let scene = 0; scene < scenes; scene++) {
      if (scene > 0) parts.push("* * *\n")
      for (let count = 0; count < Math.round(1500 / scenes); ) {
        const text = paragraph(40 + Math.floor(random() * 90))
        if (scene === 0 && count === 0) openings.push(text.slice(0, 40))
        parts.push(text + "\n")
        count += text.split(/\s+/).length
        words += text.split(/\s+/).length
      }
    }
  }
  return { markdown: parts.join("\n"), words, openings }
}

/** Random numbers that come out the same for the same seed (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
