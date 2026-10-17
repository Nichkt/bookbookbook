import { insertRow, type Db } from "@/db/tx"
import { blocksState, type Block, type Inline, type MarkName } from "@/export/blocks"
import { bytesToBase64 } from "@/yjs/base64"

/* Builders for export tests. */

export const text = (value: string, ...marks: MarkName[]): Inline => ({ type: "text", text: value, marks })
export const br: Inline = { type: "lineBreak" }
export const para = (...inlines: Inline[]): Block => ({ type: "paragraph", inlines })
export const heading = (level: 2 | 3, ...inlines: Inline[]): Block => ({ type: "heading", level, inlines })
export const quote = (...blocks: Block[]): Block => ({ type: "quote", blocks })
export const list = (ordered: boolean, items: Block[][], start = 1): Block => ({ type: "list", ordered, start, items })
export const sceneBreak: Block = { type: "break" }

/** Paragraphs of plain text. */
export const paras = (...lines: string[]): Block[] => lines.map((line) => para(text(line)))

/** Stores prose for a scene, as a compaction snapshot like the editor leaves. */
export async function writeProse(db: Db, sceneId: string, blocks: Block[]) {
  await insertRow(db, "snapshots", {
    id: `prose-${sceneId}`,
    scene_id: sceneId,
    state_b64: bytesToBase64(blocksState(blocks)),
    kind: "compaction",
    created_at: "2024-01-01T00:00:00.000Z",
  })
}
