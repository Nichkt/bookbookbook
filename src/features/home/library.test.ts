import { describe, expect, it } from "vitest"
import type { BookVisit } from "@/app/books"
import { bookPath, libraryOrder, openedLabel } from "./library"

const visit = (screen: BookVisit["screen"], at: string): BookVisit => ({ screen, at })
const book = (id: string, title: string | null, created_at: string | null) => ({ id, title, created_at })

describe("bookPath", () => {
  it("reopens a book on the screen it was last open on", () => {
    expect(bookPath({ id: "b1", words: 0 }, visit("world", "2025-03-01T10:00:00.000Z"))).toBe("/b/b1/world")
    expect(bookPath({ id: "b1", words: 900 }, visit("plan", "2025-03-01T10:00:00.000Z"))).toBe("/b/b1/plan")
  })

  it("opens a book not opened here before on Write once it has words, else on Plan", () => {
    expect(bookPath({ id: "b1", words: 120 }, undefined)).toBe("/b/b1/write")
    expect(bookPath({ id: "b1", words: 0 }, undefined)).toBe("/b/b1/plan")
  })
})

describe("libraryOrder", () => {
  const books = [
    book("a", "Alpha", "2025-01-01T00:00:00.000Z"),
    book("b", "Beta", "2025-02-01T00:00:00.000Z"),
    book("c", "Gamma", "2025-03-01T00:00:00.000Z"),
  ]

  it("puts the books opened most recently first, then the rest newest first", () => {
    const visits = { a: visit("plan", "2025-03-05T00:00:00.000Z") }
    expect(ids(libraryOrder(books, visits))).toEqual(["a", "c", "b"])
    expect(ids(libraryOrder(books, {}))).toEqual(["c", "b", "a"])
  })

  it("goes by title, then id, between books opened at the same time", () => {
    const same = "2025-03-05T00:00:00.000Z"
    const tied = [book("z", "Beta", same), book("y", "Alpha", same), book("x", "Alpha", same), book("w", null, same)]
    expect(ids(libraryOrder(tied, {}))).toEqual(["w", "x", "y", "z"])
  })

  it("puts books with no date last, and leaves the list it's given alone", () => {
    const list = [book("old", "Old", null), ...books]
    expect(ids(libraryOrder(list, {}))).toEqual(["c", "b", "a", "old"])
    expect(ids(list)).toEqual(["old", "a", "b", "c"])
  })
})

describe("openedLabel", () => {
  const now = new Date(2025, 2, 15, 9, 0)
  const at = (...parts: [number, number, number, number?]) => new Date(...parts).toISOString()

  it("counts calendar days", () => {
    expect(openedLabel(undefined, now)).toBe("Not opened yet")
    expect(openedLabel(at(2025, 2, 15, 0), now)).toBe("Opened today")
    expect(openedLabel(at(2025, 2, 14, 23), now)).toBe("Opened yesterday")
    expect(openedLabel(at(2025, 2, 3, 12), now)).toBe("Opened 12 days ago")
  })

  it("gives the date after a month, with the year if it isn't this one", () => {
    expect(openedLabel(at(2025, 0, 3), now, "en-GB")).toBe("Opened 3 Jan")
    expect(openedLabel(at(2024, 11, 3), now, "en-GB")).toBe("Opened 3 Dec 2024")
  })
})

function ids(rows: { id: string }[]) {
  return rows.map((row) => row.id)
}
