import { Schema } from "@tiptap/pm/model"
import { describe, expect, test } from "vitest"
import { planOf } from "@/test/plan"
import {
  nextSentence,
  parseRate,
  pickVoice,
  previousSentence,
  sceneAfter,
  sentenceAt,
  sentencesIn,
  splitSentences,
  voiceChoices,
  voiceLabels,
  type VoiceInfo,
} from "./readAloud"

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
})

const paragraph = (...content: (string | "<br>")[]) =>
  schema.node(
    "paragraph",
    null,
    content.map((part) => (part === "<br>" ? schema.node("hardBreak") : schema.text(part))),
  )

const doc = schema.node("doc", null, [
  paragraph("Mara ran. Jonas waited, then left."),
  paragraph("Dear sir,", "<br>", "I write."),
  paragraph("⁂"),
  schema.node("paragraph"),
  paragraph("“Run!” she said."),
])

const SENTENCES = ["Mara ran.", "Jonas waited, then left.", "Dear sir,", "I write.", "“Run!”", "she said."]

describe("splitSentences, where Intl.Segmenter is missing", () => {
  test("ends a sentence at . ! ? or … and any closing quotes after, before a space", () => {
    expect([...splitSentences("She ran. He said “Stop!” Then nothing… The end")]).toEqual([
      { segment: "She ran. ", index: 0 },
      { segment: "He said “Stop!” ", index: 9 },
      { segment: "Then nothing… ", index: 25 },
      { segment: "The end", index: 39 },
    ])
  })

  test("doesn't end one at a decimal point or a period with no space after", () => {
    expect([...splitSentences("It cost 3.50 at example.com today.")].map((part) => part.segment)).toEqual([
      "It cost 3.50 at example.com today.",
    ])
  })
})

describe("sentencesIn", () => {
  test.each([
    ["Intl.Segmenter", undefined],
    ["the fallback", splitSentences],
  ])("finds each block's sentences with %s, and a line break ends one", (_, split) => {
    const sentences = sentencesIn(doc, split)
    expect(sentences.map(({ from, to }) => doc.textBetween(from, to, " ", " "))).toEqual(SENTENCES)
    expect(sentences.slice(0, 2)).toEqual([
      { from: 1, to: 10 },
      { from: 11, to: 35 },
    ])
  })
})

const sentences = sentencesIn(doc)

describe("sentenceAt", () => {
  test("is the sentence the caret is in or at the end of, else the next", () => {
    expect(sentenceAt(sentences, 1)).toEqual({ from: 1, to: 10 })
    expect(sentenceAt(sentences, 10)).toEqual({ from: 1, to: 10 })
    expect(sentenceAt(sentences, 11)).toEqual({ from: 11, to: 35 })
    expect(sentenceAt(sentences, 58)).toEqual(sentences[4])
  })

  test("is the first after the last sentence, and nothing with none", () => {
    expect(sentenceAt(sentences, doc.content.size)).toEqual({ from: 1, to: 10 })
    expect(sentenceAt([], 1)).toBeNull()
  })
})

describe("nextSentence and previousSentence", () => {
  test("step through the sentences", () => {
    expect(nextSentence(sentences, 10, null)).toEqual({ from: 11, to: 35 })
    expect(nextSentence(sentences, sentences.at(-1)!.to, null)).toBeNull()
    expect(previousSentence(sentences, 11, null)).toEqual({ from: 1, to: 10 })
    expect(previousSentence(sentences, 1, null)).toBeNull()
  })

  test("from inside a sentence, read on from there", () => {
    expect(nextSentence(sentences, 6, null)).toEqual({ from: 6, to: 10 })
  })

  test("keep to a selection, ending at its end and not stepping back out of its start", () => {
    const bounds = { from: 6, to: 17 }
    expect(nextSentence(sentences, 6, bounds)).toEqual({ from: 6, to: 10 })
    expect(nextSentence(sentences, 10, bounds)).toEqual({ from: 11, to: 17 })
    expect(nextSentence(sentences, 17, bounds)).toBeNull()
    expect(previousSentence(sentences, 11, bounds)).toEqual({ from: 6, to: 10 })
    expect(previousSentence(sentences, 6, bounds)).toBeNull()
  })
})

describe("sceneAfter", () => {
  const plan = planOf({
    acts: [
      {
        title: "One",
        chapters: [
          { title: "Harbor", scenes: [{ title: "Dock" }, { title: "Gone", deleted: true }, { title: "Boat" }] },
          { title: "Empty" },
        ],
      },
      { title: "Two", chapters: [{ title: "Whole", scenes: [{ implicit: true }] }] },
    ],
  })

  test("is nothing in the Scene view", () => {
    expect(sceneAfter(plan, "scene", "sc-Harbor-1")).toBeNull()
  })

  test("is the chapter's next scene in the Chapter view, and nothing after its last", () => {
    expect(sceneAfter(plan, "chapter", "sc-Harbor-1")).toBe("sc-Harbor-3")
    expect(sceneAfter(plan, "chapter", "sc-Harbor-3")).toBeNull()
  })

  test("goes on past chapters without scenes in the Manuscript, to the end of the book", () => {
    expect(sceneAfter(plan, "manuscript", "sc-Harbor-3")).toBe("sc-Whole-1")
    expect(sceneAfter(plan, "manuscript", "sc-Whole-1")).toBeNull()
    expect(sceneAfter(plan, "manuscript", "sc-Nowhere-1")).toBeNull()
  })
})

const voice = (voiceURI: string, lang: string, localService = true, isDefault = false): VoiceInfo => ({
  voiceURI,
  name: voiceURI,
  lang,
  localService,
  default: isDefault,
})

describe("pickVoice", () => {
  const alex = voice("Alex", "en-US")
  const google = voice("Google US English", "en-US", false)
  const daniel = voice("Daniel", "en-GB", true, true)
  const thomas = voice("Thomas", "fr-FR")
  const voices = [google, alex, thomas, daniel]

  test("is the voice chosen, while the device has it", () => {
    expect(pickVoice(voices, "Google US English", "en-US")).toBe(google)
    expect(pickVoice(voices, "Thomas", "en-US")).toBe(thomas)
  })

  test("else prefers voices on the device, then its default, then the language's own region", () => {
    expect(pickVoice(voices, "Gone", "en-US")).toBe(daniel)
    expect(pickVoice([google, alex], null, "en-US")).toBe(alex)
    expect(pickVoice([google, alex, voice("Moira", "en-IE")], null, "en_us")).toBe(alex)
    expect(pickVoice([google], null, "en-US")).toBe(google)
  })

  test("takes any voice when none speak the language, and nothing when there are none", () => {
    expect(pickVoice([thomas, google], null, "de-DE")).toBe(thomas)
    expect(pickVoice([], null, "en-US")).toBeNull()
  })

  test("voiceChoices offers the language's voices by name, and the one in use", () => {
    expect(voiceChoices(voices, alex, "en-US").map((choice) => choice.name)).toEqual([
      "Alex",
      "Daniel",
      "Google US English",
    ])
    expect(voiceChoices(voices, thomas, "en").map((choice) => choice.name)).toContain("Thomas")
    expect(voiceChoices([thomas], thomas, "de")).toEqual([thomas])
  })

  test("voiceLabels leave off the language voices name, unless two would look the same, and mark online ones", () => {
    const david = voice("Microsoft David - English (United States)", "en-US")
    const ava = voice("Microsoft Ava Online (Natural) - English (United States)", "en-US", false)
    const libby = voice("Microsoft Libby Online (Natural) - English (United Kingdom)", "en-GB", false)
    const libbyUs = voice("Microsoft Libby Online (Natural) - English (United States)", "en-US", false)
    expect([...voiceLabels([alex, google, david, ava]).values()]).toEqual([
      "Alex",
      "Google US English (online)",
      "Microsoft David",
      "Microsoft Ava Online (Natural) (online)",
    ])
    expect([...voiceLabels([libby, libbyUs]).values()]).toEqual([
      "Microsoft Libby Online (Natural) - English (United Kingdom) (online)",
      "Microsoft Libby Online (Natural) - English (United States) (online)",
    ])
  })
})

test("parseRate takes the speeds offered, else normal speed", () => {
  expect(parseRate("1.5")).toBe(1.5)
  expect(parseRate("0.75")).toBe(0.75)
  expect(parseRate("3")).toBe(1)
  expect(parseRate(null)).toBe(1)
})
