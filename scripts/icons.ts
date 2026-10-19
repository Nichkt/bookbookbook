// Renders the app's icons from public/favicon.svg, with the installed Chrome: the installed web app's in public/, and
// the desktop app's in src-tauri/icons/, which `tauri icon` makes from one large image. `npm run icons`.
import { execSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { chromium } from "@playwright/test"

const svg = await readFile("public/favicon.svg", "utf8")
// Filling the square, for platforms that cut their own shape from it.
const fullBleed = svg.replace(/ rx="[\d.]+"/, "")
const scratch = await mkdtemp(path.join(tmpdir(), "bookbookbook-icons-"))
const desktopIcon = path.join(scratch, "app-icon.png")

const ICONS = [
  { file: "public/pwa-192x192.png", size: 192, svg },
  { file: "public/pwa-512x512.png", size: 512, svg },
  // Android masks these to a circle or a squircle; the letter sits well inside the safe zone.
  { file: "public/maskable-icon-512x512.png", size: 512, svg: fullBleed },
  // iOS rounds the corners itself, and shows see-through corners as black.
  { file: "public/apple-touch-icon-180x180.png", size: 180, svg: fullBleed },
  // Windows shows the desktop app's at every size from 16 pixels to 256, all made from this.
  { file: desktopIcon, size: 1024, svg },
]
const FILL_PAGE = "<style>body { margin: 0 } svg { display: block; width: 100vw; height: 100vh }</style>"

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage()
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(FILL_PAGE + icon.svg)
  await writeFile(icon.file, await page.screenshot({ omitBackground: true }))
  if (icon.file !== desktopIcon) console.log(icon.file)
}
await browser.close()

execSync(`npx tauri icon "${desktopIcon}"`, { stdio: "inherit" })
// The desktop app is for Windows alone (DESIGN.md §22, decision 36).
for (const other of ["android", "ios", "icon.icns"]) await rm(`src-tauri/icons/${other}`, { recursive: true, force: true })
await rm(scratch, { recursive: true, force: true })
