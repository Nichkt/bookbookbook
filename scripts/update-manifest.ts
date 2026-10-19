// Writes latest.json, which tells the desktop app which version is newest and where to download it (DESIGN.md §11),
// from a signed `tauri build`. It goes up with the installer, on the version's release on GitHub: README.md,
// "Releasing". `npm run update-manifest -- --notes notes.txt`.
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"

const RELEASES = "https://github.com/Nichkt/bookbookbook/releases"
const BUNDLE = "src-tauri/target/release/bundle/nsis"

const { values } = parseArgs({
  options: {
    // The signed installer: unless given, the one built for package.json's version.
    installer: { type: "string" },
    // A plain text file of what's new in it, which Updates shows.
    notes: { type: "string" },
    // Where the app downloads it from: unless given, the version's release on GitHub.
    url: { type: "string" },
    // Unless given, latest.json beside the installer.
    out: { type: "string" },
  },
})

const { version } = JSON.parse(await readFile("package.json", "utf8")) as { version: string }
const installer = values.installer ?? path.join(BUNDLE, `bookbookbook_${version}_x64-setup.exe`)
// The build signs each installer when TAURI_SIGNING_PRIVATE_KEY is set, in a .sig file beside it.
const signature = (await readFile(`${installer}.sig`, "utf8")).trim()
// The version the key signed for, which the app holds the manifest's to (requireSignedVersion, in tauri.conf.json).
const signed = /\bversion:(\S+)/.exec(Buffer.from(signature, "base64").toString("utf8"))?.[1]
if (!signed) throw new Error(`${installer}.sig doesn't say which version it's for: build it with npx tauri build.`)
const url = values.url ?? `${RELEASES}/download/v${signed}/${path.basename(installer)}`

const manifest = {
  version: signed,
  notes: values.notes ? (await readFile(values.notes, "utf8")).replace(/\r\n?/g, "\n").trim() : "",
  pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  platforms: { "windows-x86_64": { signature, url } },
}
const out = values.out ?? path.join(path.dirname(installer), "latest.json")
await writeFile(out, JSON.stringify(manifest, null, 2) + "\n")
console.log(`${out}: version ${signed}, from ${url}`)
