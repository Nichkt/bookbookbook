import { column, Schema, Table, type ColumnsType, type ExtractColumnValueType, type IndexShorthand } from "@powersync/web"

const { text, integer, real } = column

/*
 * Client tables from DESIGN.md §5. Columns are only text, integer or real: JSON is stored as text, booleans as
 * 0/1 integers, timestamps as ISO strings, and `position` as a fractional-indexing key. PowerSync stores each row as
 * JSON behind a view, so adding a column later needs no migration.
 */
const SYNCABLE = {
  universes: { owner_id: text, name: text },
  books: {
    universe_id: text,
    owner_id: text,
    title: text,
    genre: text,
    pov: text,
    tense: text,
    audience: text,
    target_words: integer,
    style_guide: text,
    sample_passages: text,
    template_key: text,
    created_at: text,
    deleted_at: text,
  },
  acts: { book_id: text, title: text, position: text },
  chapters: {
    book_id: text,
    act_id: text,
    position: text,
    title: text,
    summary: text,
    status: text,
    pov_entry_id: text,
    word_target: integer,
    labels: text,
    template_beat_key: text,
    location_entry_id: text,
    story_time: text,
    notes: text,
    // Set while the chapter is in the Trash (DESIGN.md §12); purged 30 days later.
    deleted_at: text,
  },
  scenes: {
    chapter_id: text,
    position: text,
    title: text,
    summary: text,
    pov_entry_id: text,
    is_implicit: integer,
    story_time: text,
    word_count: integer,
    ai_word_count: integer,
    deleted_at: text,
  },
  beats: { parent_kind: text, parent_id: text, position: text, text: text, done: integer, template_beat_key: text },
  scene_updates: { scene_id: text, update_b64: text, created_at: text, created_by: text },
  snapshots: { scene_id: text, state_b64: text, word_count: integer, label: text, kind: text, created_at: text },
  comments: { scene_id: text, anchor_b64: text, body: text, resolved: integer, created_at: text },
  codex_types: { universe_id: text, key: text, name: text, icon: text, field_schema: text, builtin: integer },
  codex_entries: {
    universe_id: text,
    type_id: text,
    name: text,
    aliases: text,
    fields: text,
    notes: text,
    tags: text,
    ai_context: text,
    color: text,
    image_path: text,
  },
  entity_links: { book_id: text, chapter_id: text, scene_id: text, entry_id: text, role: text, source: text },
  inbox_notes: { book_id: text, text: text, source: text, stt_engine: text, filed_to: text, created_at: text },
  ai_cards: {
    book_id: text,
    scene_id: text,
    tool: text,
    model: text,
    route: text,
    output: text,
    credits: real,
    created_at: text,
  },
  custom_tools: { owner_id: text, name: text, prompt_template: text, output_mode: text, default_model: text },
  templates: { owner_id: text, name: text, kind: text, beats: text },
  writing_stats: {
    book_id: text,
    date: text,
    words_added: integer,
    words_removed: integer,
    ai_words_inserted: integer,
    dictated_words: integer,
    sprints: integer,
  },
} satisfies Record<string, ColumnsType>

type SyncableName = keyof typeof SYNCABLE

const INDEXES: Partial<Record<SyncableName, IndexShorthand>> = {
  books: { universe: ["universe_id"] },
  acts: { book: ["book_id", "position"] },
  chapters: { book: ["book_id", "position"] },
  scenes: { chapter: ["chapter_id", "position"] },
  beats: { parent: ["parent_id", "position"] },
  scene_updates: { scene: ["scene_id"] },
  snapshots: { scene: ["scene_id", "kind"] },
  comments: { scene: ["scene_id"] },
  codex_types: { universe: ["universe_id"] },
  codex_entries: { universe: ["universe_id", "type_id"] },
  entity_links: { book: ["book_id"], entry: ["entry_id"], scene: ["scene_id"] },
  inbox_notes: { book: ["book_id"] },
  ai_cards: { book: ["book_id"] },
  writing_stats: { book: ["book_id", "date"] },
}

/** Device-only tables that never sync (DESIGN.md §5), whatever the sync mode. */
const DEVICE_ONLY = {
  ui_prefs: new Table({ value: text }, { localOnly: true }),
  provider_keys: new Table({ provider: text, label: text, secret: text, created_at: text }, { localOnly: true }),
  mention_index: new Table(
    { scene_id: text, entry_id: text, count: integer },
    { localOnly: true, indexes: { scene: ["scene_id"], entry: ["entry_id"] } },
  ),
  search_index: new Table(
    { book_id: text, scene_id: text, body: text, updated_at: text },
    { localOnly: true, indexes: { scene: ["scene_id"] } },
  ),
}

/**
 * PowerSync's local-only → synced pattern (DESIGN.md §11.6): every syncable table exists twice, and `synced`
 * decides which copy answers to the plain name (`chapters`) while the other hides as `inactive_*`. Guests use the
 * `local_*` copies. Signing up will call `db.updateSchema(makeSchema(true))`, then copy rows from
 * `inactive_local_*` into the synced tables in one transaction.
 */
export function makeSchema(synced: boolean) {
  const tables: Record<string, Table> = { ...DEVICE_ONLY }
  for (const [name, columns] of Object.entries(SYNCABLE)) {
    const indexes = INDEXES[name as SyncableName]
    tables[name] = new Table(columns, { indexes, viewName: synced ? name : `inactive_synced_${name}` })
    tables[`local_${name}`] = new Table(columns, {
      indexes,
      localOnly: true,
      viewName: synced ? `inactive_local_${name}` : name,
    })
  }
  return new Schema(tables)
}

/**
 * Names to pass to `db.onChange({ tables })` for a view. Change notifications name the table behind the view,
 * and with the switch above that is `local_<name>` or `<name>` depending on the mode.
 */
export const tablesBehind = (...views: SyncableName[]) => views.flatMap((view) => [view, `local_${view}`])

type Row<C extends ColumnsType> = { id: string } & { [K in keyof C]: ExtractColumnValueType<C[K]> }

export type BookRow = Row<typeof SYNCABLE.books>
export type ActRow = Row<typeof SYNCABLE.acts>
export type ChapterRow = Row<typeof SYNCABLE.chapters>
export type SceneRow = Row<typeof SYNCABLE.scenes>
export type BeatRow = Row<typeof SYNCABLE.beats>
export type CodexTypeRow = Row<typeof SYNCABLE.codex_types>
export type CodexEntryRow = Row<typeof SYNCABLE.codex_entries>
export type EntityLinkRow = Row<typeof SYNCABLE.entity_links>

export const CHAPTER_STATUSES = ["idea", "outlined", "drafting", "revising", "done"] as const
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

/** `entity_links.role` values. POV and location are single-valued, so they live on the chapter row instead. */
export type LinkRole = "pov" | "present" | "thread" | "location"
