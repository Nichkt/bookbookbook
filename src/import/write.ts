import { generateNKeysBetween } from "fractional-indexing"
import { insertBuiltinCodexTypes } from "@/db/codexTypes"
import { unusedTitle } from "@/db/queries"
import { insertRow, type Db } from "@/db/tx"
import { blocksState, type Block } from "@/export/blocks"
import { DEFAULT_BOOK_TARGET } from "@/features/books/mutations"
import { newChapterRow, newSceneRow } from "@/features/plan/mutations"
import { newId } from "@/lib/id"
import { countWords } from "@/lib/words"
import { bytesToBase64 } from "@/yjs/base64"
import { proseText } from "@/yjs/prose"
import { docFromState } from "@/yjs/versions"
import { ALL_LEFT_OUT, ImportError } from "./errors"
import { importGroups, type Outline } from "./outline"

/*
 * Import's last step (DESIGN.md §13): the outline as the preview left it, written as a new book beside the others,
 * as a restored backup is. Each scene's prose goes in as its first compaction, so it opens as imported. The words
 * imported aren't the day's writing: no stats.
 */

export interface ImportInput {
  title: string
  author: string
  outline: Outline
}

export interface ImportResult {
  bookId: string
  /** The title asked for, or `… (imported)` when another book has it. */
  title: string
  /** The first chapter, to open. */
  chapterId: string
}

/** A target the book is some way towards already: the usual one, or its words rounded up to the next 10,000. */
export const importTarget = (words: number) => Math.max(DEFAULT_BOOK_TARGET, Math.ceil(words / 10_000) * 10_000)

interface Prose {
  state: Uint8Array
  /** As the editor counts them, so opening the scene adds nothing to the day's stats. */
  words: number
}

function sceneProse(blocks: readonly Block[]): Prose | null {
  if (blocks.length === 0) return null
  const state = blocksState(blocks)
  const doc = docFromState(state)
  try {
    return { state, words: countWords(proseText(doc)) }
  } finally {
    doc.destroy()
  }
}

export async function importBook(db: Db, input: ImportInput, now = new Date()): Promise<ImportResult> {
  // The prose is encoded first, so the transaction holds the database no longer than the inserts take.
  const acts = importGroups(input.outline).map((group) => ({
    title: group.title?.trim() ?? null,
    chapters: group.chapters.map((chapter) => ({
      title: chapter.title.trim(),
      scenes: chapter.scenes.map((scene) => ({ title: scene.title.trim(), prose: sceneProse(scene.blocks) })),
    })),
  }))
  const chapters = acts.flatMap((act) => act.chapters)
  if (chapters.length === 0) throw new ImportError(ALL_LEFT_OUT)
  const words = chapters
    .flatMap((chapter) => chapter.scenes)
    .reduce((sum, scene) => sum + (scene.prose?.words ?? 0), 0)
  const nowIso = now.toISOString()
  const universeId = newId()
  const bookId = newId()
  const actKeys = generateNKeysBetween(null, null, acts.filter((act) => act.title !== null).length)
  const chapterKeys = generateNKeysBetween(null, null, chapters.length)

  return db.writeTransaction(async (tx) => {
    const title = await unusedTitle(tx, input.title.trim() || "Untitled book", "imported")
    await insertRow(tx, "universes", { id: universeId, name: title })
    await insertRow(tx, "books", {
      id: bookId,
      universe_id: universeId,
      title,
      author: input.author.trim() || null,
      genre: "",
      target_words: importTarget(words),
      style_guide: "",
      sample_passages: "[]",
      created_at: nowIso,
    })
    await insertBuiltinCodexTypes(tx, universeId)

    const chapterIds: string[] = []
    for (const act of acts) {
      let actId: string | null = null
      if (act.title !== null) {
        actId = newId()
        await insertRow(tx, "acts", { id: actId, book_id: bookId, title: act.title, position: actKeys.shift()! })
      }
      for (const chapter of act.chapters) {
        const chapterId = newId()
        chapterIds.push(chapterId)
        const written = chapter.scenes.some((scene) => scene.prose)
        await insertRow(
          tx,
          "chapters",
          newChapterRow({
            id: chapterId,
            book_id: bookId,
            position: chapterKeys[chapterIds.length - 1],
            act_id: actId,
            title: chapter.title,
            status: written ? "drafting" : "idea",
          }),
        )
        // A chapter without scenes gets its implicit scene when it's first opened, as a new one does.
        const sceneKeys = generateNKeysBetween(null, null, chapter.scenes.length)
        const implicit = chapter.scenes.length === 1 && !chapter.scenes[0].title
        for (const [index, scene] of chapter.scenes.entries()) {
          const sceneId = newId()
          await insertRow(
            tx,
            "scenes",
            newSceneRow({
              id: sceneId,
              chapter_id: chapterId,
              position: sceneKeys[index],
              title: scene.title,
              is_implicit: implicit ? 1 : 0,
              word_count: scene.prose?.words ?? 0,
            }),
          )
          if (!scene.prose) continue
          await insertRow(tx, "snapshots", {
            id: newId(),
            scene_id: sceneId,
            state_b64: bytesToBase64(scene.prose.state),
            word_count: scene.prose.words,
            kind: "compaction",
            created_at: nowIso,
          })
        }
      }
    }
    return { bookId, title, chapterId: chapterIds[0] }
  })
}
