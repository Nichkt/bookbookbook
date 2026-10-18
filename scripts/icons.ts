// Renders the installed app's icons in public/ from public/favicon.svg, with the installed Chrome: `npm run icons`.
import { readFile, writeFile } from "node:fs/promises"
import { chromium } from "@playwright/test"

const svg = await readFile("public/favicon.svg", "utf8")
// Filling the square, for platforms that cut their own shape from it.
const fullBleed = svg.replace(/ rx="[\d.]+"/, "")

const ICONS = [
  { file: "pwa-192x192.png", size: 192, svg },
  { file: "pwa-512x512.png", size: 512, svg },
  // Android masks these to a circle or a squircle; the letter sits well inside the safe zone.
  { file: "maskable-icon-512x512.png", size: 512, svg: fullBleed },
  // iOS rounds the corners itself, and shows see-through corners as black.
  { file: "apple-touch-icon-180x180.png", size: 180, svg: fullBleed },
]
const FILL_PAGE = "<style>body { margin: 0 } svg { display: block; width: 100vw; height: 100vh }</style>"

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage()
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(FILL_PAGE + icon.svg)
  await writeFile(`public/${icon.file}`, await page.screenshot({ omitBackground: true }))
  console.log(`public/${icon.file}`)
}
await browser.close()
