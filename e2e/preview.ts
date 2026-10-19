import { readFile } from "node:fs/promises"
import path from "node:path"
import { build, preview } from "vite"

/*
 * Builds bookbookbook for production and serves it, for e2e/pwa.spec.ts, as only that build has the service worker.
 * In the e2e mode, so it has the sample book the tests open, as a real install doesn't (src/db/powersync.ts), and goes
 * to dist-e2e/ rather than dist/. playwright.config.ts runs it with the port to serve on.
 *
 * A browser with the NEW_VERSION cookie gets a new version of the service worker, as if one had since been deployed.
 * So a test can have a new version all its own, while the tests running alongside it keep the first.
 */

/** The cookie, set to the new version's name. The new version answers "version?" with it, and the first, nothing. */
const NEW_VERSION = "bbb-new-version"

const newVersion = (name: string) => `
self.addEventListener("message", (event) => {
  if (event.data === "version?") event.ports[0].postMessage(${JSON.stringify(name)})
})
`

await build({ logLevel: "error", mode: "e2e" })
const server = await preview({
  mode: "e2e",
  preview: { port: Number(process.argv[2]), strictPort: true },
  plugins: [
    {
      name: "new-version",
      configurePreviewServer({ config, middlewares }) {
        const serviceWorker = path.resolve(config.root, config.build.outDir, "sw.js")
        const asked = new RegExp(`(?:^|;\\s*)${NEW_VERSION}=(\\w+)`)
        middlewares.use((request, response, next) => {
          const name = request.url === "/sw.js" && request.headers.cookie?.match(asked)?.[1]
          if (!name) return next()
          readFile(serviceWorker, "utf8").then((built) => {
            response.setHeader("Content-Type", "text/javascript")
            response.setHeader("Cache-Control", "no-cache")
            response.end(built + newVersion(name))
          }, next)
        })
      },
    },
  ],
})
server.printUrls()
