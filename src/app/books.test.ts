import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { bookVisits, rememberBook } from "./books"

const VISITS = "bbb.bookVisits"

beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("rememberBook", () => {
  it("keeps the screen each book was last open on, and when", () => {
    rememberBook("b1", "plan", new Date("2025-03-01T10:00:00Z"))
    rememberBook("b2", "write", new Date("2025-03-02T10:00:00Z"))
    rememberBook("b1", "world", new Date("2025-03-03T10:00:00Z"))
    expect(bookVisits()).toEqual({
      b1: { screen: "world", at: "2025-03-03T10:00:00.000Z" },
      b2: { screen: "write", at: "2025-03-02T10:00:00.000Z" },
    })
    expect(localStorage.getItem("bbb.lastBook")).toBe("b1")
  })

  it("only marks the book as open without a screen", () => {
    rememberBook("b1")
    expect(localStorage.getItem("bbb.lastBook")).toBe("b1")
    expect(bookVisits()).toEqual({})
  })

  it("carries on when storage is blocked", () => {
    const blocked = () => {
      throw new DOMException("Blocked", "SecurityError")
    }
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(() => rememberBook("b1", "plan")).not.toThrow()
    expect(bookVisits()).toEqual({})
  })
})

describe("bookVisits", () => {
  it("skips anything that isn't a visit", () => {
    const good = { screen: "plan", at: "2025-03-01T10:00:00.000Z" }
    localStorage.setItem(
      VISITS,
      JSON.stringify({ good, inbox: { ...good, screen: "inbox" }, undated: { ...good, at: "soon" }, junk: 4, none: null }),
    )
    expect(bookVisits()).toEqual({ good })
  })

  it("reads nothing from junk", () => {
    for (const junk of ["{", "null", "4", '"text"']) {
      localStorage.setItem(VISITS, junk)
      expect(bookVisits()).toEqual({})
    }
  })
})
