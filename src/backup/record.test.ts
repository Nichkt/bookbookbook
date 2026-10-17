import { describe, expect, it } from "vitest"
import {
  afterBackup,
  afterCheck,
  daysBetween,
  lastBackupLabel,
  lastBackupSentence,
  parseRecord,
  reminderFor,
  snoozeUntil,
  writingSince,
  type BackupRecord,
} from "./record"

const at = (day: number, hour = 12, minute = 0) => new Date(2025, 2, day, hour, minute)
const iso = (day: number, hour = 12, minute = 0) => at(day, hour, minute).toISOString()
const midnight = (day: number) => new Date(2025, 2, day).toISOString()

const record = (fields: Partial<BackupRecord> = {}): BackupRecord => ({
  last: null,
  hash: "old",
  hashedAt: iso(10),
  dayWords: 0,
  changedAt: null,
  ...fields,
})

describe("parseRecord", () => {
  it("reads a record, and takes nothing else for one", () => {
    const value = record({ last: iso(9), changedAt: iso(11), dayWords: 40 })
    expect(parseRecord(JSON.stringify(value))).toEqual(value)
    expect(parseRecord(JSON.stringify({ hashedAt: iso(10), last: "soon", hash: "", dayWords: "9", changedAt: 4 }))).toEqual(
      record({ hash: null }),
    )
    for (const junk of [null, "", "{", "[]", "null", '"text"', JSON.stringify({ last: iso(9) })]) {
      expect(parseRecord(junk)).toBeNull()
    }
  })
})

describe("writingSince", () => {
  it("dates writing a record's fingerprint can't hold", () => {
    const hashed = record({ hashedAt: iso(10, 15), dayWords: 50 })
    expect(writingSince(hashed, [])).toBeNull()
    expect(writingSince(hashed, [{ date: "2025-03-09", words: 900 }])).toBeNull()
    // Writing that day counts once there's more of it than when the fingerprint was taken, over every device.
    expect(writingSince(hashed, [{ date: "2025-03-10", words: 50 }])).toBeNull()
    expect(writingSince(hashed, [{ date: "2025-03-10", words: 30 }, { date: "2025-03-10", words: 30 }])).toBe(iso(10, 15))
    expect(writingSince(hashed, [{ date: "2025-03-12", words: 0 }])).toBeNull()
    expect(writingSince(hashed, [{ date: "2025-03-13", words: 5 }, { date: "2025-03-12", words: 5 }])).toBe(midnight(12))
  })

  it("dates all of it without a record", () => {
    expect(writingSince(null, [])).toBeNull()
    expect(writingSince(null, [{ date: "2025-03-04", words: 1 }, { date: "2025-02-27", words: 3 }])).toBe(
      new Date(2025, 1, 27).toISOString(),
    )
  })
})

describe("afterBackup", () => {
  it("records the backup, and today's writing so far", () => {
    const days = [{ date: "2025-03-12", words: 70 }, { date: "2025-03-11", words: 500 }]
    expect(afterBackup("new", days, at(12, 9))).toEqual({
      last: iso(12, 9),
      hash: "new",
      hashedAt: iso(12, 9),
      dayWords: 70,
      changedAt: null,
    })
    // A restored backup was made when it says.
    expect(afterBackup("new", days, at(12, 9), at(1)).last).toBe(iso(1))
  })
})

describe("afterCheck", () => {
  it("takes a book with nothing written as its own baseline at first", () => {
    expect(afterCheck(null, "first", [], at(12))).toEqual({
      last: null,
      hash: "first",
      hashedAt: iso(12),
      dayWords: 0,
      changedAt: null,
    })
  })

  it("dates a book's writing from its first day at first, when nothing's backed it up", () => {
    const days = [{ date: "2025-03-12", words: 20 }, { date: "2025-02-20", words: 900 }]
    expect(afterCheck(null, "first", days, at(12))).toEqual({
      last: null,
      hash: null,
      hashedAt: iso(12),
      dayWords: 20,
      changedAt: new Date(2025, 1, 20).toISOString(),
    })
  })

  it("keeps the record while the book's the same, and clears a change undone", () => {
    const same = record({ last: iso(10) })
    expect(afterCheck(same, "old", [], at(20))).toBe(same)
    expect(afterCheck(record({ changedAt: iso(11) }), "old", [], at(20))).toEqual(record())
  })

  it("dates a change by the writing since the fingerprint, or else now", () => {
    expect(afterCheck(record(), "new", [], at(14))).toEqual(record({ changedAt: iso(14) }))
    expect(afterCheck(record(), "new", [{ date: "2025-03-11", words: 3 }], at(14))).toEqual(record({ changedAt: midnight(11) }))
    const changed = record({ changedAt: iso(11) })
    expect(afterCheck(changed, "newer", [{ date: "2025-03-13", words: 3 }], at(14))).toBe(changed)
  })
})

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween(at(1, 23, 59), at(2, 0, 1))).toBe(1)
    expect(daysBetween(at(2, 0, 1), at(2, 23, 59))).toBe(0)
    // Across the clocks changing, in places they do.
    expect(daysBetween(new Date(2025, 2, 25), new Date(2025, 3, 5))).toBe(11)
    expect(daysBetween(at(5), at(3))).toBe(-2)
  })
})

describe("reminderFor", () => {
  const changed = (fields: Partial<BackupRecord> = {}) => record({ changedAt: iso(1), ...fields })

  it("reminds once a change has gone a week without a backup", () => {
    expect(reminderFor(null, "off", null, at(30))).toBeNull()
    expect(reminderFor(record(), "off", null, at(30))).toBeNull()
    expect(reminderFor(changed(), "off", null, at(7, 23))).toBeNull()
    expect(reminderFor(changed(), "off", null, at(8))).toEqual({ kind: "never" })
    expect(reminderFor(changed({ last: iso(1, 9) }), "off", null, at(8))).toEqual({ kind: "stale", days: 7 })
    // Folder backups on don't hush it: a book they can't back up still needs one.
    expect(reminderFor(changed({ last: iso(1, 9) }), "on", null, at(9))).toEqual({ kind: "stale", days: 8 })
  })

  it("asks at once when folder backups need the writer", () => {
    expect(reminderFor(changed({ changedAt: iso(8) }), "paused", null, at(8, 13))).toEqual({ kind: "paused" })
    expect(reminderFor(changed({ changedAt: iso(8) }), "stopped", null, at(8, 13))).toEqual({ kind: "stopped" })
    expect(reminderFor(record(), "paused", null, at(8, 13))).toBeNull()
  })

  it("waits while put off", () => {
    expect(reminderFor(changed(), "off", iso(9), at(8))).toBeNull()
    expect(reminderFor(changed(), "off", iso(9), at(9))).toEqual({ kind: "never" })
    expect(reminderFor(changed(), "paused", iso(9), at(8))).toBeNull()
  })
})

describe("snoozeUntil", () => {
  it("puts a reminder off for a week, and a folder's for a day", () => {
    expect(snoozeUntil({ kind: "never" }, at(1))).toBe(new Date(at(1).getTime() + 7 * 86_400_000).toISOString())
    expect(snoozeUntil({ kind: "stale", days: 9 }, at(1))).toBe(new Date(at(1).getTime() + 7 * 86_400_000).toISOString())
    expect(snoozeUntil({ kind: "paused" }, at(1))).toBe(new Date(at(1).getTime() + 86_400_000).toISOString())
    expect(snoozeUntil({ kind: "stopped" }, at(1))).toBe(new Date(at(1).getTime() + 86_400_000).toISOString())
  })
})

describe("the last backup, in words", () => {
  const now = at(31, 18)

  it("labels it for the book menu", () => {
    const label = (last: string | null) => lastBackupLabel(last, now, "en-GB")
    expect(label(null)).toBe("Never")
    expect(label(iso(31, 8))).toBe("Today")
    expect(label(iso(30, 23))).toBe("Yesterday")
    expect(label(iso(19))).toBe("12 days ago")
    expect(label(iso(1))).toBe("1 Mar")
    expect(label(new Date(2024, 11, 24).toISOString())).toBe("24 Dec 2024")
  })

  it("says it in a sentence for the Backups dialog", () => {
    const sentence = (last: string | null) => lastBackupSentence(last, now, "en-GB")
    expect(sentence(null)).toBe("Never backed up.")
    expect(sentence(iso(31, 14, 32))).toBe("Last backed up today at 14:32.")
    expect(sentence(iso(30, 9, 5))).toBe("Last backed up yesterday at 09:05.")
    expect(sentence(iso(19))).toBe("Last backed up 12 days ago, on 19 March.")
    expect(sentence(iso(1))).toBe("Last backed up on 1 March.")
    expect(sentence(new Date(2024, 11, 24).toISOString())).toBe("Last backed up on 24 December 2024.")
  })
})
