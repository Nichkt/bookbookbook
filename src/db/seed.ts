import type { AbstractPowerSyncDatabase, Transaction } from "@powersync/web"
import { generateNKeysBetween } from "fractional-indexing"
import { newId } from "@/lib/id"
import { countWords } from "@/lib/words"
import { bytesToBase64 } from "@/yjs/base64"
import { proseState } from "@/yjs/prose"
import { CODEX_TYPES, SAMPLE_ACTS, SAMPLE_BOOK, SAMPLE_CHAPTERS, SAMPLE_CODEX } from "./sampleBook"

type Value = string | number | null

async function insert(tx: Transaction, table: string, row: Record<string, Value>) {
  const columns = Object.keys(row)
  await tx.execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    Object.values(row),
  )
}

/** Rich-text fields (codex notes) hold a ProseMirror JSON doc. */
const richText = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

/** Seeds the sample book on first run. One transaction, so two tabs opening at once can't both seed. */
export async function seedIfEmpty(db: AbstractPowerSyncDatabase): Promise<boolean> {
  return db.writeTransaction(async (tx) => {
    const { n } = await tx.get<{ n: number }>("SELECT count(*) AS n FROM books")
    if (n > 0) return false

    const now = new Date().toISOString()
    const universeId = newId()
    const bookId = newId()
    await insert(tx, "universes", { id: universeId, name: SAMPLE_BOOK.universe })
    await insert(tx, "books", {
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

    const typeIds = new Map<string, string>()
    for (const type of CODEX_TYPES) {
      const id = newId()
      typeIds.set(type.key, id)
      await insert(tx, "codex_types", {
        id,
        universe_id: universeId,
        key: type.key,
        name: type.name,
        icon: type.icon,
        field_schema: JSON.stringify(type.fields.map((label) => ({ label, kind: "text" }))),
        builtin: 1,
      })
    }

    const entryIds = new Map<string, string>()
    for (const entry of SAMPLE_CODEX) {
      const id = newId()
      entryIds.set(entry.key, id)
      await insert(tx, "codex_entries", {
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

    const actPositions = generateNKeysBetween(null, null, SAMPLE_ACTS.length)
    const actIds = SAMPLE_ACTS.map(() => newId())
    for (const [index, title] of SAMPLE_ACTS.entries()) {
      await insert(tx, "acts", { id: actIds[index], book_id: bookId, title, position: actPositions[index] })
    }

    const chapterPositions = generateNKeysBetween(null, null, SAMPLE_CHAPTERS.length)
    for (const [index, chapter] of SAMPLE_CHAPTERS.entries()) {
      const chapterId = newId()
      await insert(tx, "chapters", {
        id: chapterId,
        book_id: bookId,
        act_id: actIds[chapter.act],
        position: chapterPositions[index],
        title: chapter.title,
        summary: chapter.summary,
        status: chapter.status,
        pov_entry_id: entryIds.get(chapter.pov) ?? null,
        word_target: chapter.target,
        labels: JSON.stringify(chapter.labels),
        template_beat_key: chapter.beat,
        location_entry_id: entryIds.get(chapter.place) ?? null,
        story_time: chapter.time,
        notes: chapter.notes ?? "",
      })

      const beatPositions = generateNKeysBetween(null, null, chapter.beats.length)
      for (const [beatIndex, [text, done]] of chapter.beats.entries()) {
        await insert(tx, "beats", {
          id: newId(),
          parent_kind: "chapter",
          parent_id: chapterId,
          position: beatPositions[beatIndex],
          text,
          done: done ? 1 : 0,
        })
      }

      // A chapter without scenes gets its implicit scene when it's first opened (see ensureScene).
      const scenePositions = generateNKeysBetween(null, null, chapter.scenes.length)
      for (const [sceneIndex, scene] of chapter.scenes.entries()) {
        const sceneId = newId()
        const words = countWords(scene.prose.join(" "))
        await insert(tx, "scenes", {
          id: sceneId,
          chapter_id: chapterId,
          position: scenePositions[sceneIndex],
          title: scene.title,
          summary: "",
          pov_entry_id: entryIds.get(scene.pov) ?? null,
          is_implicit: 0,
          word_count: words,
          ai_word_count: 0,
        })
        await insert(tx, "snapshots", {
          id: newId(),
          scene_id: sceneId,
          state_b64: bytesToBase64(proseState(scene.prose)),
          word_count: words,
          kind: "compaction",
          created_at: now,
        })
      }
    }
    return true
  })
}
