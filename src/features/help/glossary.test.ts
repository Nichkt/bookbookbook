import { describe, expect, it } from "vitest"
import { COMMAND_HELP } from "@/speech/commands"
import { GLOSSARY, GLOSSARY_GROUPS, searchGlossary, termById } from "./glossary"

const ids = (terms: { id: string }[]) => terms.map((term) => term.id)

describe("GLOSSARY", () => {
  it("has one entry per id and per name", () => {
    expect(termById.size).toBe(GLOSSARY.length)
    expect(new Set(GLOSSARY.map((term) => term.term.toLowerCase())).size).toBe(GLOSSARY.length)
  })

  it("points only at terms that exist, never at itself", () => {
    for (const term of GLOSSARY) {
      for (const related of term.related ?? []) {
        expect(termById.has(related), `${term.id} → ${related}`).toBe(true)
        expect(related).not.toBe(term.id)
      }
    }
  })

  it("puts every term in a group, and every group has terms", () => {
    const groups = GLOSSARY_GROUPS.map((group) => group.id)
    for (const term of GLOSSARY) expect(groups).toContain(term.group)
    for (const group of groups) expect(GLOSSARY.some((term) => term.group === group), group).toBe(true)
  })

  it("explains each term in full sentences", () => {
    for (const term of GLOSSARY) {
      expect(term.body.length, term.id).toBeGreaterThan(0)
      for (const paragraph of term.body) expect(paragraph, term.id).toMatch(/^\S.*[.!?:”)]$/)
    }
  })

  it("explains a moment as a beat", () => {
    const moment = termById.get("moment")
    expect(moment?.aka).toContain("Beat")
    expect(moment?.body.join(" ")).toMatch(/\bbeats?\b/i)
  })

  it("lists every voice command dictation knows", () => {
    const listed = termById.get("voice-commands")?.items?.join(" ").toLowerCase() ?? ""
    const phrases = COMMAND_HELP.flatMap((command) => command.say.split(", ")).filter((say) => say !== "then a command")
    expect(phrases.length).toBeGreaterThan(10)
    for (const phrase of phrases) expect(listed, phrase).toContain(`“${phrase}”`)
  })
})

describe("searchGlossary", () => {
  it("lists every term for an empty search", () => {
    expect(searchGlossary("  ")).toEqual(GLOSSARY)
  })

  it("puts terms named for the search first, finding them by their other names too", () => {
    expect(ids(searchGlossary("beat"))[0]).toBe("moment")
    expect(ids(searchGlossary("POV"))[0]).toBe("point-of-view")
    expect(ids(searchGlossary("codex"))[0]).toBe("world")
    expect(ids(searchGlossary("thread"))[0]).toBe("story-point")
    expect(ids(searchGlossary("regex"))[0]).toBe("pattern")
    expect(ids(searchGlossary("text to speech"))[0]).toBe("read-aloud")
    expect(ids(searchGlossary("quick-create"))[0]).toBe("add-to-world")
    expect(ids(searchGlossary("dictate"))[0]).toBe("dictation")
    expect(ids(searchGlossary("online"))[0]).toBe("on-device")
    expect(ids(searchGlossary("quick note"))[0]).toBe("inbox")
    expect(ids(searchGlossary("command palette"))[0]).toBe("search")
  })

  it("puts names with the words in that order before names with them in another", () => {
    expect(ids(searchGlossary("speech to text"))[0]).toBe("dictation")
    expect(ids(searchGlossary("speech to text"))).toContain("read-aloud")
    expect(ids(searchGlossary("to sort"))[0]).toBe("filing")
  })

  it("needs every word, ignoring case and accents", () => {
    expect(ids(searchGlossary("WORD count"))).toContain("word-count-target")
    expect(ids(searchGlossary("scène"))).toContain("scene")
    expect(searchGlossary("moment zzzz")).toEqual([])
  })

  it("finds words in the explanations too, after the names", () => {
    expect(ids(searchGlossary("beginning"))).toContain("act")
    const found = ids(searchGlossary("scene"))
    expect(found[0]).toBe("scene")
    expect(found.length).toBeGreaterThan(1)
  })
})
