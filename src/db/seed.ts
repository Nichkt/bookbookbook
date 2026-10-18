import { generateNKeysBetween } from "fractional-indexing"
import { serializeStoryTime, storyTimeFromText } from "@/features/plan/storyTime"
import { newId } from "@/lib/id"
import { countWords } from "@/lib/words"
import { bytesToBase64 } from "@/yjs/base64"
import { proseState } from "@/yjs/prose"
import { insertBuiltinCodexTypes } from "./codexTypes"
import { SAMPLE_ACTS, SAMPLE_BOOK, SAMPLE_CHAPTERS, SAMPLE_CODEX, SAMPLE_INBOX } from "./sampleBook"
import { insertRow, type Db } from "./tx"

/** Rich-text fields (codex notes) hold a ProseMirror JSON doc. */
const richText = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

const storyTime = (text: string) => serializeStoryTime(storyTimeFromText(text))

/** Seeds the sample book on first run. One transaction, so two tabs opening at once can't both seed. */
export async function seedIfEmpty(db: Db): Promise<boolean> {
  return db.writeTransaction(async (tx) => {
    const { n } = await tx.get<{ n: number }>("SELECT count(*) AS n FROM books")
    if (n > 0) return false

    const now = new Date().toISOString()
    const universeId = newId()
    const bookId = newId()
    await insertRow(tx, "universes", { id: universeId, name: SAMPLE_BOOK.universe })
    await insertRow(tx, "books", {
      id: bookId,
      universe_id: universeId,
      title: SAMPLE_BOOK.title,
      genre: SAMPLE_BOOK.genre,
      pov: SAMPLE_BOOK.pov,
      tense: SAMPLE_BOOK.tense,
      audience: SAMPLE_BOOK.audience,
      target_words: SAMPLE_BOOK.targetWords,
      style_guide: "",
      sample_passages: "[]",
      template_key: SAMPLE_BOOK.templateKey,
      created_at: now,
    })

    const typeIds = await insertBuiltinCodexTypes(tx, universeId)
    const entryIds = new Map<string, string>()
    for (const entry of SAMPLE_CODEX) {
      const id = newId()
      entryIds.set(entry.key, id)
      await insertRow(tx, "codex_entries", {
        id,
        universe_id: universeId,
        type_id: typeIds.get(entry.type) ?? null,
        name: entry.name,
        aliases: JSON.stringify(entry.aliases),
        fields: JSON.stringify(entry.fields),
        notes: richText(entry.notes),
        tags: JSON.stringify(entry.tags),
        ai_context: entry.aiContext,
        color: entry.color,
      })
    }
    const entryId = (key: string) => entryIds.get(key) ?? null

    const actPositions = generateNKeysBetween(null, null, SAMPLE_ACTS.length)
    const actIds = SAMPLE_ACTS.map(() => newId())
    for (const [index, title] of SAMPLE_ACTS.entries()) {
      await insertRow(tx, "acts", { id: actIds[index], book_id: bookId, title, position: actPositions[index] })
    }

    const chapterPositions = generateNKeysBetween(null, null, SAMPLE_CHAPTERS.length)
    for (const [index, chapter] of SAMPLE_CHAPTERS.entries()) {
      const chapterId = newId()
      await insertRow(tx, "chapters", {
        id: chapterId,
        book_id: bookId,
        act_id: actIds[chapter.act],
        position: chapterPositions[index],
        title: chapter.title,
        summary: chapter.summary,
        status: chapter.status,
        pov_entry_id: entryId(chapter.pov),
        word_target: chapter.target,
        labels: JSON.stringify(chapter.labels),
        template_beat_key: chapter.beat || null,
        location_entry_id: entryId(chapter.place),
        story_time: storyTime(chapter.time),
        notes: chapter.notes ?? "",
        deleted_at: null,
      })

      const beatPositions = generateNKeysBetween(null, null, chapter.beats.length)
      for (const [beatIndex, [text, done]] of chapter.beats.entries()) {
        await insertRow(tx, "beats", {
          id: newId(),
          parent_kind: "chapter",
          parent_id: chapterId,
          position: beatPositions[beatIndex],
          text,
          done: done ? 1 : 0,
        })
      }

      for (const [role, keys] of [
        ["thread", chapter.threads],
        ["present", chapter.present],
      ] as const) {
        for (const key of keys) {
          await insertRow(tx, "entity_links", {
            id: newId(),
            book_id: bookId,
            chapter_id: chapterId,
            scene_id: null,
            entry_id: entryId(key),
            role,
            source: "manual",
          })
        }
      }

      // A chapter without scenes gets its implicit scene when it's first opened (see ensureScene).
      const scenePositions = generateNKeysBetween(null, null, chapter.scenes.length)
      for (const [sceneIndex, scene] of chapter.scenes.entries()) {
        const sceneId = newId()
        const words = countWords(scene.prose.join(" "))
        await insertRow(tx, "scenes", {
          id: sceneId,
          chapter_id: chapterId,
          position: scenePositions[sceneIndex],
          title: scene.title,
          summary: "",
          pov_entry_id: entryId(scene.pov),
          is_implicit: 0,
          story_time: null,
          word_count: words,
          ai_word_count: 0,
          deleted_at: null,
        })
        await insertRow(tx, "snapshots", {
          id: newId(),
          scene_id: sceneId,
          state_b64: bytesToBase64(proseState(scene.prose)),
          word_count: words,
          kind: "compaction",
          created_at: now,
        })
      }
    }

    for (const note of SAMPLE_INBOX) {
      await insertRow(tx, "inbox_notes", {
        id: newId(),
        book_id: bookId,
        text: note.text,
        source: note.dictated ? "voice-live" : "typed",
        stt_engine: note.dictated ? "on-device" : null,
        filed_to: null,
        created_at: new Date(Date.parse(now) - note.minutesAgo * 60_000).toISOString(),
      })
    }
    return true
  })
}