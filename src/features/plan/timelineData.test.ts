import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { seedIfEmpty } from "@/db/seed"
import { planOf } from "@/test/plan"
import { createTestDb } from "@/test/sqliteDb"
import { readPlan } from "./planData"
import { EVENTS_SQL, eventsFromRows, NO_POV, readingOrder, storyOrder, type EventRow } from "./timelineData"

let db: ReturnType<typeof createTestDb>
beforeEach(() => {
  db = createTestDb()
})
afterEach(() => db.close())

async function sample() {
  await seedIfEmpty(db)
  const { id } = await db.get<{ id: string }>("SELECT id FROM books")
  const plan = await readPlan(db, id)
  const events = eventsFromRows(await db.getAll<EventRow>(EVENTS_SQL, [id]))
  return { plan, events }
}

describe("story order on the sample book", () => {
  test("the flashback first, then the main timeline by day and part of day", async () => {
    const { plan, events } = await sample()
    const order = storyOrder(plan, events)
    const columns = order.slots.map((slot) => [
      slot.label,
      slot.chapters.map((chapter) => chapter.number).join(","),
      slot.events.map((event) => event.name).join(","),
    ])
    expect(columns).toEqual([
      ["12 years earlier", "9", "The Night Ferry sinks"],
      ["Three days before Chapter 1", "", "Thomas drowns"],
      ["Day 1, morning", "1", ""],
      ["Day 1, night", "2", ""],
      ["Day 2, evening", "3", ""],
      ["Day 3, dawn", "4", ""],
      ["Day 4, morning", "5", ""],
      ["Day 4, night", "6,7", "The Storm"],
      ["Day 5", "8", ""],
      ["Day 7", "10", ""],
      ["Day 8, night", "11", ""],
      ["Day 9", "12", ""],
    ])
    expect(order.eras).toEqual([{ era: "flashback", span: 2 }])
    expect(order.slots.slice(0, 2).map((slot) => slot.era)).toEqual(["flashback", "flashback"])
    expect(order.slots[2].era).toBeNull()
    expect(order.unplaced).toEqual([])
    expect(order.unplacedEvents).toEqual([])
  })

  test("one lane per point-of-view character, in order of their first chapter", async () => {
    const { plan, events } = await sample()
    expect(storyOrder(plan, events).lanes.map((lane) => lane.entry?.name)).toEqual([
      "Mara Quill",
      "Jonas Quill",
      "Thomas Quill",
    ])
  })

  test("no lane for a character whose chapters aren't placed in time", async () => {
    const { plan, events } = await sample()
    const chapters = plan.chapters.map((chapter) => (chapter.number === 9 ? { ...chapter, time: null } : chapter))
    const unplaced = { ...plan, chapters }
    const order = storyOrder(unplaced, events)
    expect(order.lanes.map((lane) => lane.entry?.name)).toEqual(["Mara Quill", "Jonas Quill"])
    expect(order.unplaced.map((chapter) => chapter.number)).toEqual([9])
    expect(readingOrder(unplaced).lanes.map((lane) => lane.entry?.name)).toEqual([
      "Mara Quill",
      "Jonas Quill",
      "Thomas Quill",
    ])
  })

  test("events read their When field", async () => {
    const { events } = await sample()
    expect(events.map((event) => [event.name, event.when])).toEqual([
      ["The Night Ferry sinks", "12 years earlier"],
      ["The Storm", "Day 4 night"],
      ["Thomas drowns", "Three days before Chapter 1"],
    ])
    expect(events[1].time).toEqual({ mode: "relative", day: 4, part: "night" })
  })
})

describe("story order", () => {
  test("a day without a part comes before its parts; dates come after story days", () => {
    const plan = planOf({
      loose: [
        { title: "Evening", time: "Day 2 evening" },
        { title: "Dated", time: JSON.stringify({ mode: "date", date: "1891-10-04" }) },
        { title: "Whole day", time: "Day 2" },
        { title: "Dawn", time: "Day 2 dawn" },
        { title: "Before", time: "Day -1" },
      ],
    })
    expect(storyOrder(plan, []).slots.map((slot) => slot.chapters[0].title)).toEqual([
      "Before",
      "Whole day",
      "Dawn",
      "Evening",
      "Dated",
    ])
  })

  test("chapters with no time, or only a label or a part of the day, aren't placed", () => {
    const plan = planOf({
      loose: [
        { title: "None" },
        { title: "Label", time: "The next spring" },
        { title: "Part", time: JSON.stringify({ mode: "relative", part: "night" }) },
        { title: "Placed", time: "Day 1" },
      ],
    })
    const order = storyOrder(plan, [])
    expect(order.unplaced.map((chapter) => chapter.title)).toEqual(["None", "Label", "Part"])
    expect(order.slots.map((slot) => slot.label)).toEqual(["Day 1"])
    expect(order.lanes).toEqual([{ key: NO_POV, entry: null }])
  })

  test("each era gets its own stretch, in the order first met", () => {
    const era = (label: string, name: string, day?: number) =>
      JSON.stringify({ mode: "relative", label, era: name, ...(day === undefined ? {} : { day }) })
    const plan = planOf({
      loose: [
        { title: "Now", time: "Day 1" },
        { title: "Dream B", time: era("Second dream", "dream", 2) },
        { title: "Flashback", time: era("Years ago", "flashback") },
        { title: "Dream A", time: era("First dream", "dream", 1) },
        { title: "Dream again", time: era("Second dream", "dream", 2) },
      ],
    })
    const order = storyOrder(plan, [])
    expect(order.eras).toEqual([
      { era: "dream", span: 2 },
      { era: "flashback", span: 1 },
    ])
    expect(order.slots.map((slot) => [slot.label, slot.chapters.map((chapter) => chapter.title).join(",")])).toEqual([
      ["First dream", "Dream A"],
      ["Second dream", "Dream B,Dream again"],
      ["Years ago", "Flashback"],
      ["Day 1", "Now"],
    ])
  })
})

describe("reading order", () => {
  test("marks the sample book's flashback", async () => {
    const { plan } = await sample()
    const jumps = readingOrder(plan).columns.filter((column) => column.jump)
    expect(jumps.map((column) => [column.chapter.number, column.jump])).toEqual([
      [9, { kind: "outside", era: "flashback" }],
    ])
  })

  test("a chapter set earlier than one before it jumps back in time", () => {
    const plan = planOf({
      loose: [
        { title: "A", time: "Day 3" },
        { title: "B", time: "Day 5" },
        { title: "C", time: "Day 4" },
        { title: "D" },
        { title: "E", time: "Day 5 night" },
        { title: "F", time: "Day 1" },
      ],
    })
    expect(readingOrder(plan).columns.map((column) => column.jump)).toEqual([
      null,
      null,
      { kind: "back", from: 2 },
      null,
      null,
      { kind: "back", from: 5 },
    ])
  })
})
