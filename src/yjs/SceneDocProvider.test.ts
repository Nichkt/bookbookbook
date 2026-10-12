import * as Y from "yjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MemorySceneStore } from "./memorySceneStore"
import { SceneDocProvider, type SceneDocProviderOptions } from "./SceneDocProvider"

const SCENE = "scene-1"

const providers: SceneDocProvider[] = []
afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.destroy()))
})

/** Opens the scene like a tab would. The idle timer is pushed out of the way; tests compact explicitly. */
function open(store: MemorySceneStore, options: SceneDocProviderOptions = {}) {
  const provider = new SceneDocProvider(store, SCENE, { idleCompactMs: 60_000, ...options })
  providers.push(provider)
  return provider
}

async function reopen(store: MemorySceneStore, options: SceneDocProviderOptions = {}) {
  const provider = open(store, options)
  await provider.loaded
  return provider
}

const textOf = (provider: SceneDocProvider) => provider.doc.getText("t").toString()
const type = (provider: SceneDocProvider, text: string) => {
  const ytext = provider.doc.getText("t")
  ytext.insert(ytext.length, text)
}

describe("SceneDocProvider", () => {
  it("persists edits and loads them back", async () => {
    const store = new MemorySceneStore()
    const first = open(store)
    await first.loaded
    type(first, "Hello")
    type(first, ", world")
    await store.settled()
    expect(store.count(SCENE, "update")).toBeGreaterThan(0)

    expect(textOf(await reopen(store))).toBe("Hello, world")
  })

  it("writes edits made while a write is in flight as one merged row", async () => {
    const store = new MemorySceneStore()
    const provider = open(store)
    await provider.loaded
    type(provider, "a")
    type(provider, "b")
    type(provider, "c")
    await store.settled()

    // The first edit's write starts at once; the two that queue behind it share a row.
    expect(store.count(SCENE, "update")).toBe(2)
    expect(textOf(await reopen(store))).toBe("abc")
  })

  it("brings two open copies of a scene (two tabs) to the same text", async () => {
    const store = new MemorySceneStore()
    const a = open(store)
    const b = open(store)
    await Promise.all([a.loaded, b.loaded])
    type(a, "from A. ")
    type(b, "from B. ")
    await store.settled()

    expect(textOf(a)).toBe(textOf(b))
    expect(textOf(a)).toContain("from A. ")
    expect(textOf(a)).toContain("from B. ")
  })

  it("applies rows that arrive from elsewhere (another device, once sync lands)", async () => {
    const store = new MemorySceneStore()
    const provider = open(store)
    await provider.loaded

    const remote = new Y.Doc()
    remote.getText("t").insert(0, "synced in")
    store.inject(SCENE, { id: "remote-1", kind: "update", data: Y.encodeStateAsUpdateV2(remote) })
    await store.settled()

    expect(textOf(provider)).toBe("synced in")
  })

  it("compacts once enough update rows build up, without losing text", async () => {
    const store = new MemorySceneStore()
    const provider = open(store, { compactAfter: 5 })
    await provider.loaded
    for (let i = 0; i < 6; i++) {
      type(provider, `${i}`)
      await store.settled()
    }

    expect(store.count(SCENE, "snapshot")).toBe(1)
    expect(store.count(SCENE, "update")).toBe(1)
    expect(provider.pendingRows).toBe(1)
    expect(textOf(await reopen(store))).toBe("012345")
  })

  it("survives two tabs compacting the same scene at once", async () => {
    const store = new MemorySceneStore()
    const a = open(store)
    const b = open(store)
    await Promise.all([a.loaded, b.loaded])
    for (let i = 0; i < 4; i++) {
      type(a, `a${i} `)
      type(b, `b${i} `)
    }
    await store.settled()
    await Promise.all([a.compact(), b.compact()])
    await store.settled()
    expect(store.count(SCENE, "update")).toBe(0)
    expect(store.count(SCENE, "snapshot")).toBe(2)

    type(a, "after")
    await store.settled()
    const fresh = await reopen(store)
    expect(textOf(fresh)).toBe(textOf(a))
    expect(textOf(fresh)).toBe(textOf(b))
    for (let i = 0; i < 4; i++) {
      expect(textOf(fresh)).toContain(`a${i} `)
      expect(textOf(fresh)).toContain(`b${i} `)
    }
    expect(textOf(fresh)).toContain("after")

    // The next compaction folds both snapshots into one.
    await fresh.compact()
    await store.settled()
    expect(store.count(SCENE)).toBe(1)
    expect(textOf(await reopen(store))).toBe(textOf(a))
  })

  it("stops counting rows another tab compacted away", async () => {
    const store = new MemorySceneStore()
    const a = open(store)
    const b = open(store)
    await Promise.all([a.loaded, b.loaded])
    type(a, "one ")
    type(a, "two ")
    await store.settled()
    expect(b.pendingRows).toBe(2)

    await a.compact()
    await store.settled()
    expect(store.count(SCENE, "update")).toBe(0)
    expect(b.pendingRows).toBe(0)
    expect(textOf(b)).toBe("one two ")
  })

  it("recovers from a failed write by storing the edit in the next snapshot", async () => {
    const store = new MemorySceneStore()
    const onError = vi.fn()
    const provider = open(store, { onError })
    await provider.loaded
    store.failNextAppends = 1
    type(provider, "kept anyway")
    await store.settled()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(store.count(SCENE, "snapshot")).toBe(1)
    expect(textOf(await reopen(store))).toBe("kept anyway")
  })

  it("skips an unreadable row, reports it, and never deletes it", async () => {
    const store = new MemorySceneStore()
    const writer = open(store, { onError: () => {} })
    await writer.loaded
    type(writer, "good text")
    await store.settled()
    store.inject(SCENE, { id: "garbage", kind: "update", data: new Uint8Array([255, 255, 255, 255, 255, 255]) })

    const onError = vi.fn()
    const reader = open(store, { onError })
    await reader.loaded
    expect(onError).toHaveBeenCalledTimes(1)
    expect(String(onError.mock.calls[0][0])).toContain("garbage")
    expect(textOf(reader)).toBe("good text")

    await reader.compact()
    await store.settled()
    expect(store.rows.has("garbage")).toBe(true)
    expect(textOf(await reopen(store, { onError: () => {} }))).toBe("good text")
  })

  it("compacts on close when enough rows built up", async () => {
    const store = new MemorySceneStore()
    const provider = new SceneDocProvider(store, SCENE, { idleMinUpdates: 3, idleCompactMs: 60_000 })
    await provider.loaded
    for (let i = 0; i < 3; i++) {
      type(provider, `${i}`)
      await store.settled()
    }
    await provider.destroy()

    expect(store.count(SCENE, "update")).toBe(0)
    expect(store.count(SCENE, "snapshot")).toBe(1)
    expect(textOf(await reopen(store))).toBe("012")
  })

  it("leaves a small scene alone on close", async () => {
    const store = new MemorySceneStore()
    const provider = new SceneDocProvider(store, SCENE, { idleMinUpdates: 3, idleCompactMs: 60_000 })
    await provider.loaded
    type(provider, "short")
    await provider.destroy()

    expect(store.count(SCENE, "update")).toBe(1)
    expect(store.count(SCENE, "snapshot")).toBe(0)
    expect(textOf(await reopen(store))).toBe("short")
  })
})
