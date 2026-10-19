import { afterEach, beforeEach, expect, test, vi } from "vitest"

// One spy for every fresh copy of the module below, so the test sees what each of them called.
const seedIfEmpty = vi.hoisted(() => vi.fn(async () => true))

// No real database: all that's checked is whether opening one fills it with the sample book.
vi.mock("@powersync/web", () => ({
  PowerSyncDatabase: class {
    async init() {}
  },
}))
vi.mock("./schema", () => ({ makeSchema: () => ({}) }))
vi.mock("./seed", () => ({ seedIfEmpty }))
vi.mock("./trash", () => ({ purgeExpiredTrash: async () => undefined }))

/** Opens the database as a build in `mode` does. The module decides as it loads, so each build gets a fresh copy. */
async function openAs(mode: string, dev: boolean) {
  vi.stubEnv("MODE", mode)
  vi.stubEnv("DEV", dev)
  vi.resetModules()
  const { openDatabase } = await import("./powersync")
  await openDatabase()
}

beforeEach(() => {
  seedIfEmpty.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test("a real install, on the web or the desktop, starts with no books", async () => {
  await openAs("production", false)
  await openAs("desktop", false)
  expect(seedIfEmpty).not.toHaveBeenCalled()
})

test("development and the end-to-end tests' build fill an empty library with the sample book", async () => {
  await openAs("development", true)
  await openAs("e2e", false)
  expect(seedIfEmpty).toHaveBeenCalledTimes(2)
})
