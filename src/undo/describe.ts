import { groupChapters, sortByPosition } from "@/db/order"
import type { SqlValue, Tx } from "@/db/tx"
import type { RecordingContext, Row } from "./recorder"
import type { StepChange } from "./steps"

/*
 * What Undo and Redo call a step ("Undo: Changed the status of chapter 3"), in the screens' own words, and numbered
 * as the plan numbers chapters. A step is named by its main change: a chapter over the links it brought along, and
 * a row made or deleted over the rows re-keyed to make room.
 */

const quoted = (text: string) => `“${text}”`

const textOf = (value: SqlValue | undefined) => (typeof value === "string" ? value.trim() : "")

const stringOrNull = (value: SqlValue | undefined) => (typeof value === "string" ? value : null)

/** Which table's change names a step that changed several. */
const RANK = ["books", "acts", "chapters", "scenes", "codex_entries", "codex_types", "inbox_notes", "beats", "entity_links"]

const rank = (table: string) => (RANK.includes(table) ? RANK.indexOf(table) : RANK.length)

/** The fields as the chapter's popout labels them. */
const CHAPTER_FIELDS: Readonly<Record<string, string>> = {
  summary: "summary",
  status: "status",
  pov_entry_id: "point of view",
  word_target: "word count target",
  labels: "labels",
  template_beat_key: "structure moment",
  location_entry_id: "location",
  story_time: "story time",
  notes: "notes",
}

const SCENE_FIELDS: Readonly<Record<string, string>> = {
  summary: "summary",
  pov_entry_id: "point of view",
  story_time: "story time",
}

const ENTRY_FIELDS: Readonly<Record<string, string>> = {
  fields: "details",
  aliases: "aliases",
  tags: "tags",
  notes: "notes",
  type_id: "type",
  color: "color",
  image_path: "picture",
}

const TYPE_FIELDS: Readonly<Record<string, string>> = { field_schema: "fields", icon: "icon" }

const BOOK_FIELDS: Readonly<Record<string, string>> = {
  author: "author",
  genre: "genre",
  pov: "point of view",
  tense: "tense",
  audience: "audience",
  target_words: "word count target",
  daily_goal: "daily goal",
  style_guide: "style guide",
  sample_passages: "sample passages",
  template_key: "structure",
  premise: "premise",
  synopsis: "synopsis",
}

const LINK_ROLES: Readonly<Record<string, string>> = {
  present: "the characters present in",
  thread: "the story points of",
  pov: "the point of view of",
  location: "the location of",
}

/** A step's name, read in its transaction once its writes are done. */
export async function describe(tx: Tx, changes: readonly StepChange[], context: RecordingContext): Promise<string> {
  const change = primary(changes)
  if (!change) return "Edit"
  try {
    return (await LABELS[change.table]?.(change, new Names(tx, changes, context.bookId))) ?? "Edit"
  } catch (error) {
    console.error("[undo] couldn't name an edit", error)
    return "Edit"
  }
}

/** A scene's name, for Undo to name typing in it: "“Ferry wake”", or "scene 2 of chapter 3". */
export const nameScene = (reader: Tx, bookId: string, sceneId: string) => new Names(reader, [], bookId).scene(sceneId)

/** The change that names the step. Rows only re-keyed to make room come last; of those, the one moved last. */
function primary(changes: readonly StepChange[]): StepChange | undefined {
  const kind = (change: StepChange) => (!change.before ? 0 : !change.after ? 1 : 2)
  const real = changes.filter((change) => kind(change) < 2 || change.columns.some((column) => column !== "position"))
  if (real.length === 0) return changes[changes.length - 1]
  return [...real].sort((a, b) => rank(a.table) - rank(b.table) || kind(a) - kind(b))[0]
}

/** The columns changed besides where the row sits, unless that's all that changed. */
const edited = (columns: readonly string[], placing: readonly string[]) => {
  const rest = columns.filter((column) => !placing.includes(column))
  return rest.length > 0 ? rest : columns
}

const moved = (columns: readonly string[], placing: readonly string[]) =>
  columns.every((column) => placing.includes(column))

/** Whether the change put the row in the Trash (1), took it out (-1), or neither (0). */
function trashed({ before, after, columns }: StepChange): number {
  if (!columns.includes("deleted_at")) return 0
  return after?.deleted_at && !before?.deleted_at ? 1 : !after?.deleted_at && before?.deleted_at ? -1 : 0
}

/** "Changed the summary of", or "Edited" when several fields changed. */
function changedFields(columns: readonly string[], fields: Readonly<Record<string, string>>, name: string) {
  const field = columns.length === 1 ? fields[columns[0]] : undefined
  return field ? `Changed the ${field} of ${name}` : `Edited ${name}`
}

type Describer = (change: StepChange, names: Names) => Promise<string>

const LABELS: Readonly<Record<string, Describer>> = {
  async books({ columns }) {
    if (columns.length === 1 && columns[0] === "title") return "Renamed the book"
    const field = columns.length === 1 ? BOOK_FIELDS[columns[0]] : undefined
    return field ? `Changed the book's ${field}` : "Changed the book's settings"
  },

  async acts(change, names) {
    const { id, before, after } = change
    if (!before) return `Added ${await names.act(id, after)}`
    if (!after) return `Deleted ${await names.act(id, before)}`
    const columns = edited(change.columns, ["position"])
    if (moved(columns, ["position"])) return `Moved ${await names.act(id, after)}`
    if (columns.length === 1 && columns[0] === "title") return `Renamed ${await names.act(id, before)}`
    return `Edited ${await names.act(id, after)}`
  },

  async chapters(change, names) {
    const { id, before, after } = change
    if (!before) return `Added ${await names.chapter(id, after)}`
    if (!after) return `Deleted ${await names.chapter(id, before)}`
    const trash = trashed(change)
    if (trash === 1) return `Moved ${await names.chapter(id, before)} to the Trash`
    if (trash === -1) return `Put back ${await names.chapter(id, after)}`
    const placing = ["act_id", "position"]
    const columns = edited(change.columns, placing)
    if (moved(columns, placing)) return `Moved ${await names.chapter(id, after)}`
    if (columns.length === 1 && columns[0] === "title") return `Renamed ${await names.chapter(id, before)}`
    return changedFields(columns, CHAPTER_FIELDS, await names.chapter(id, after))
  },

  async scenes(change, names) {
    const { id, before, after } = change
    if (!before) {
      return textOf(after?.title)
        ? `Added the scene ${quoted(textOf(after?.title))}`
        : `Added a scene to ${await names.chapter(stringOrNull(after?.chapter_id))}`
    }
    if (!after) return `Deleted ${await names.scene(id, before)}`
    const trash = trashed(change)
    if (trash === 1) return `Moved ${await names.scene(id, before)} to the Trash`
    if (trash === -1) return `Put back ${await names.scene(id, after)}`
    if (change.columns.includes("is_implicit") && !after.is_implicit) {
      return `Added a scene to ${await names.chapter(stringOrNull(after.chapter_id))}`
    }
    const placing = ["chapter_id", "position"]
    const columns = edited(change.columns, placing)
    if (moved(columns, placing)) return `Moved ${await names.scene(id, after)}`
    if (columns.length === 1 && columns[0] === "title") return `Renamed ${await names.scene(id, before)}`
    return changedFields(columns, SCENE_FIELDS, await names.scene(id, after))
  },

  async beats(change, names) {
    const { before, after } = change
    const row = (after ?? before)!
    const parent =
      row.parent_kind === "scene"
        ? await names.scene(stringOrNull(row.parent_id))
        : await names.chapter(stringOrNull(row.parent_id))
    if (!before) return `Added a moment to ${parent}`
    if (!after) return `Deleted a moment from ${parent}`
    const columns = edited(change.columns, ["parent_kind", "parent_id", "position"])
    if (columns.length === 1 && columns[0] === "done") {
      return after.done ? `Marked a moment done in ${parent}` : `Marked a moment not done in ${parent}`
    }
    if (moved(columns, ["parent_kind", "parent_id", "position"])) return `Moved a moment in ${parent}`
    return `Edited a moment in ${parent}`
  },

  async entity_links({ before, after }, names) {
    const row = (after ?? before)!
    const target = row.scene_id
      ? await names.scene(stringOrNull(row.scene_id))
      : await names.chapter(stringOrNull(row.chapter_id))
    return `Changed ${LINK_ROLES[String(row.role)] ?? "the links of"} ${target}`
  },

  async codex_entries(change, names) {
    const { before, after } = change
    if (!before) return `Added ${names.entry(after)} to the World`
    if (!after) return `Deleted ${names.entry(before)} from the World`
    const trash = trashed(change)
    if (trash === 1) return `Moved ${names.entry(before)} to the Trash`
    if (trash === -1) return `Put back ${names.entry(after)}`
    const { columns } = change
    if (columns.length === 1 && columns[0] === "name") return `Renamed ${names.entry(before)}`
    if (columns.length === 1 && columns[0] === "ai_context") return `Changed when AI tools know about ${names.entry(after)}`
    return changedFields(columns, ENTRY_FIELDS, names.entry(after))
  },

  async codex_types({ before, after, columns }) {
    const name = (row: Row | null) => (textOf(row?.name) ? quoted(textOf(row?.name)) : "a type")
    if (!before) return `Added the type ${name(after)}`
    if (!after) return `Deleted the type ${name(before)}`
    if (columns.length === 1 && columns[0] === "name") return `Renamed the type ${name(before)}`
    const field = columns.length === 1 ? TYPE_FIELDS[columns[0]] : undefined
    return field ? `Changed the ${field} of the type ${name(after)}` : `Edited the type ${name(after)}`
  },

  async inbox_notes({ before, after, columns }) {
    if (!before) return "Added a note"
    if (!after) return "Deleted a note"
    if (columns.includes("filed_to")) return after.filed_to ? "Filed a note" : "Moved a note back to To sort"
    return "Edited a note"
  },
}

interface Placed {
  id: string
  position: string | null
  act_id: string | null
  title: string
}

/**
 * Names of the book's acts, chapters, scenes and entries, read once per step. Rows the step deleted or put in the
 * Trash still count, so "Deleted chapter 3" names the chapter as it was.
 */
class Names {
  private chapterNumbers?: Promise<Map<string, number>>
  private actNumbers?: Promise<Map<string, number>>
  private readonly tx: Tx
  private readonly changes: readonly StepChange[]
  private readonly bookId: string

  constructor(tx: Tx, changes: readonly StepChange[], bookId: string) {
    this.tx = tx
    this.changes = changes
    this.bookId = bookId
  }

  /** "“Ferry wake”", or "chapter 3" when untitled. `row` is the chapter as it was when it's not as it is now. */
  async chapter(id: string | null, row?: Row | null): Promise<string> {
    if (!id) return "a chapter"
    const chapter = row ?? (await this.row("chapters", id))
    if (textOf(chapter?.title)) return quoted(textOf(chapter?.title))
    const number = (await (this.chapterNumbers ??= this.numberChapters())).get(id)
    return number ? `chapter ${number}` : "a chapter"
  }

  /** "“Ferry wake”", "scene 2 of chapter 3", or for a chapter written as one piece, the chapter's name. */
  async scene(id: string | null, row?: Row | null): Promise<string> {
    if (!id) return "a scene"
    const scene = row ?? (await this.row("scenes", id))
    if (!scene) return "a scene"
    if (textOf(scene.title)) return quoted(textOf(scene.title))
    const chapterId = stringOrNull(scene.chapter_id)
    if (scene.is_implicit) return this.chapter(chapterId)
    const siblings = await this.listed("scenes", "SELECT * FROM scenes WHERE chapter_id = ?", [chapterId])
    const index = sortByPosition(siblings.filter((sibling) => sibling.chapter_id === chapterId)).findIndex(
      (sibling) => sibling.id === id,
    )
    const number = (await (this.chapterNumbers ??= this.numberChapters())).get(chapterId ?? "")
    if (index === -1 || !number) return "a scene"
    return `scene ${index + 1} of chapter ${number}`
  }

  /** "“Act title”", or "act 2" when untitled. */
  async act(id: string, row?: Row | null): Promise<string> {
    const act = row ?? (await this.row("acts", id))
    if (textOf(act?.title)) return quoted(textOf(act?.title))
    const number = (await (this.actNumbers ??= this.numberActs())).get(id)
    return number ? `act ${number}` : "an act"
  }

  entry(row: Row | null): string {
    return textOf(row?.name) ? quoted(textOf(row?.name)) : "an entry"
  }

  private async row(table: string, id: string): Promise<Row | null> {
    const change = this.changes.find((change) => change.table === table && change.id === id)
    if (change) return change.after ?? change.before
    return this.tx.getOptional<Row>(`SELECT * FROM ${table} WHERE id = ?`, [id])
  }

  /** Rows as the plan lists them, plus those the step deleted or put in the Trash, as they were. */
  private async listed(table: string, sql: string, parameters: SqlValue[]): Promise<(Row & Placed)[]> {
    const gone = new Map<string, Row>()
    for (const change of this.changes) {
      if (change.table === table && change.before && (!change.after || trashed(change) === 1)) {
        gone.set(change.id, change.before)
      }
    }
    const rows = await this.tx.getAll<Row>(sql, parameters)
    const listed = rows.filter((row) => !row.deleted_at || gone.has(row.id)).map((row) => gone.get(row.id) ?? row)
    for (const [id, row] of gone) if (!rows.some((current) => current.id === id)) listed.push(row)
    return listed.map((row) => ({
      ...row,
      position: stringOrNull(row.position),
      act_id: stringOrNull(row.act_id),
      title: textOf(row.title),
    }))
  }

  private async numberActs(): Promise<Map<string, number>> {
    const acts = await this.listed("acts", "SELECT * FROM acts WHERE book_id = ?", [this.bookId])
    return new Map(sortByPosition(acts).map((act, index) => [act.id, index + 1]))
  }

  private async numberChapters(): Promise<Map<string, number>> {
    const acts = await this.listed("acts", "SELECT * FROM acts WHERE book_id = ?", [this.bookId])
    const chapters = await this.listed("chapters", "SELECT * FROM chapters WHERE book_id = ?", [this.bookId])
    const numbers = new Map<string, number>()
    for (const group of groupChapters(acts, chapters)) {
      for (const chapter of group.chapters) numbers.set(chapter.id, numbers.size + 1)
    }
    return numbers
  }
}
