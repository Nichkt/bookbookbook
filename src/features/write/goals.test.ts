import { describe, expect, test } from "vitest"
import { dayBefore, formatClock, minutesLeft, streakDays } from "./goals"
import { sprintWordsLabel } from "./sprint"

test("dayBefore steps back across months and years", () => {
  expect(dayBefore("2025-03-10")).toBe("2025-03-09")
  expect(dayBefore("2025-03-01")).toBe("2025-02-28")
  expect(dayBefore("2024-03-01")).toBe("2024-02-29")
  expect(dayBefore("2025-01-01")).toBe("2024-12-31")
})

describe("streakDays", () => {
  const days = (...rows: [string, number][]) => rows.map(([date, net]) => ({ date, net }))

  test("is 0 without a goal", () => {
    expect(streakDays(days(["2025-03-10", 900]), "2025-03-10", null)).toBe(0)
    expect(streakDays(days(["2025-03-10", 900]), "2025-03-10", 0)).toBe(0)
  })

  test("counts today once it's met, and the days running before it", () => {
    const rows = days(["2025-03-10", 500], ["2025-03-09", 650], ["2025-03-08", 500], ["2025-03-06", 900])
    expect(streakDays(rows, "2025-03-10", 500)).toBe(3)
  })

  test("runs to yesterday until today's goal is met, so it isn't lost before the day is out", () => {
    const rows = days(["2025-03-10", 120], ["2025-03-09", 650], ["2025-03-08", 500])
    expect(streakDays(rows, "2025-03-10", 500)).toBe(2)
    expect(streakDays(days(["2025-03-08", 500]), "2025-03-10", 500)).toBe(0)
  })

  test("holds every day to the goal as it is now, and a day spent cutting falls short", () => {
    const rows = days(["2025-03-10", 300], ["2025-03-09", 400], ["2025-03-08", -50])
    expect(streakDays(rows, "2025-03-10", 300)).toBe(2)
    expect(streakDays(rows, "2025-03-10", 350)).toBe(1)
    expect(streakDays(rows, "2025-03-10", 450)).toBe(0)
  })

  test("crosses month ends", () => {
    expect(streakDays(days(["2025-03-01", 10], ["2025-02-28", 10], ["2025-02-27", 10]), "2025-03-01", 10)).toBe(3)
  })
})

test("formatClock rounds up, so it never shows 0:00 before the time is up", () => {
  expect(formatClock(25 * 60_000)).toBe("25:00")
  expect(formatClock(59_001)).toBe("1:00")
  expect(formatClock(61_000)).toBe("1:01")
  expect(formatClock(3_725_000)).toBe("1:02:05")
  expect(formatClock(1)).toBe("0:01")
  expect(formatClock(0)).toBe("0:00")
  expect(formatClock(-5000)).toBe("0:00")
})

test("minutesLeft reads the time left in whole minutes, at least one", () => {
  expect(minutesLeft(12 * 60_000)).toBe("12 minutes left")
  expect(minutesLeft(60_001)).toBe("2 minutes left")
  expect(minutesLeft(60_000)).toBe("1 minute left")
  expect(minutesLeft(0)).toBe("1 minute left")
})

test("sprintWordsLabel says how many words, or how many were cut", () => {
  expect(sprintWordsLabel(312)).toBe("312 words")
  expect(sprintWordsLabel(1)).toBe("1 word")
  expect(sprintWordsLabel(0)).toBe("0 words")
  expect(sprintWordsLabel(-40)).toBe("40 words cut")
})
