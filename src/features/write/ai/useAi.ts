import { useQuery } from "@powersync/react"
import { useEditorState } from "@tiptap/react"
import { useCallback, useMemo } from "react"
import { CARDS_SQL, parseCard, type Card, type CardRow } from "@/ai/cards"
import { parseSlotsOff, serializeSlotsOff, type SlotId } from "@/ai/context"
import { textBetween } from "@/ai/docText"
import {
  AI_SETTINGS_PREF,
  AI_SLOTS_PREF,
  AI_TINT_PREF,
  AI_TOOL_PREF,
  connectionOf,
  KEYS_SQL,
  keyMap,
  parseAiSettings,
  setupProblem,
  type AiSettings,
  type KeyRow,
} from "@/ai/settings"
import { aiShare, toolTarget } from "@/ai/target"
import {
  BUILTIN_TOOLS,
  CUSTOM_TOOLS_SQL,
  customTool,
  fieldValues,
  parseToolPref,
  toolById,
  type CustomToolRow,
  type FieldValues,
  type ToolDef,
} from "@/ai/tools"
import { usePrefState } from "@/db/prefs"
import { useActiveEditor } from "@/editor/activeEditor"
import { chapterName } from "@/features/plan/commands"
import type { Plan } from "@/features/plan/planData"
import { countWords } from "@/lib/words"
import { chapterOfScene, sceneNameIn } from "../writeContext"

/** The AI settings and keys on this device, and whether they're enough to send a request. */
export function useAiSettings() {
  const pref = usePrefState(AI_SETTINGS_PREF)
  const { data: keyRows, isLoading: keysLoading } = useQuery<KeyRow>(KEYS_SQL)
  const settings = useMemo(() => parseAiSettings(pref.value), [pref.value])
  const keys = useMemo(() => keyMap(keyRows), [keyRows])
  const { set } = pref
  const save = useCallback((next: AiSettings) => set(JSON.stringify(next)), [set])
  const problem = useMemo(() => setupProblem(settings, keys), [settings, keys])
  const connection = useMemo(() => connectionOf(settings, keys), [settings, keys])
  return {
    isLoading: pref.isLoading || keysLoading,
    settings,
    keys,
    /** What's missing before a request can go; null when nothing is. */
    problem,
    connection,
    save,
  }
}

/** Whether AI-written text shows its tint (DESIGN.md §8 "Provenance and stats"). */
export function useAiTint() {
  const pref = usePrefState(AI_TINT_PREF)
  const { set } = pref
  return {
    isLoading: pref.isLoading,
    tint: pref.value !== "off",
    setTint: useCallback((on: boolean) => set(on ? "on" : "off"), [set]),
  }
}

/** The writer's own tools, shared by all their books. */
export function useCustomTools() {
  const { data, isLoading } = useQuery<CustomToolRow>(CUSTOM_TOOLS_SQL)
  const tools = useMemo(() => data.map(customTool), [data])
  return { rows: data, tools, isLoading }
}

/** The tool the panel shows and its fields, as the writer last left them. */
export function useToolChoice(custom: readonly ToolDef[]) {
  const pref = usePrefState(AI_TOOL_PREF)
  const parsed = useMemo(() => parseToolPref(pref.value), [pref.value])
  const tool = toolById(parsed.tool, custom) ?? BUILTIN_TOOLS[0]
  const fields = useMemo(() => fieldValues(tool, parsed.fields[tool.id]), [tool, parsed])
  const { set } = pref
  const setTool = useCallback((id: string) => set(JSON.stringify({ ...parsed, tool: id })), [parsed, set])
  const setField = useCallback(
    (key: string, value: string) =>
      set(JSON.stringify({ ...parsed, fields: { ...parsed.fields, [tool.id]: { ...fields, [key]: value } } })),
    [fields, parsed, set, tool.id],
  )
  /** What any tool's fields were last left at. */
  const fieldsFor = useCallback((other: ToolDef) => fieldValues(other, parsed.fields[other.id]), [parsed])
  return { isLoading: pref.isLoading, tool, fields, setTool, setField, fieldsFor }
}

/** The context slots the writer turned off on this device. */
export function useSlotsOff() {
  const pref = usePrefState(AI_SLOTS_PREF)
  const off = useMemo(() => parseSlotsOff(pref.value), [pref.value])
  const { set } = pref
  const setSlot = useCallback(
    (id: SlotId, on: boolean) => {
      const next = new Set(off)
      if (on) next.delete(id)
      else next.add(id)
      set(serializeSlotsOff(next))
    },
    [off, set],
  )
  return { isLoading: pref.isLoading, off, setSlot }
}

/** The book's result cards, newest first. */
export function useCards(bookId: string): Card[] {
  const { data } = useQuery<CardRow>(CARDS_SQL, [bookId])
  return useMemo(() => data.flatMap((row) => parseCard(row) ?? []), [data])
}

const AI_SHARE_SQL = `
  SELECT COALESCE(SUM(s.word_count), 0) AS words, COALESCE(SUM(s.ai_word_count), 0) AS ai_words,
    COALESCE(SUM(CASE WHEN s.chapter_id = ? THEN s.word_count END), 0) AS chapter_words,
    COALESCE(SUM(CASE WHEN s.chapter_id = ? THEN s.ai_word_count END), 0) AS chapter_ai_words
  FROM scenes s JOIN chapters c ON c.id = s.chapter_id
  WHERE c.book_id = ? AND s.deleted_at IS NULL AND c.deleted_at IS NULL`

interface ShareRow {
  words: number | null
  ai_words: number | null
  chapter_words: number | null
  chapter_ai_words: number | null
}

/** How much of the chapter and the book is AI-written (DESIGN.md §8 "Provenance and stats"). */
export function useAiShare(bookId: string, chapterId: string) {
  const { data } = useQuery<ShareRow>(AI_SHARE_SQL, [chapterId, chapterId, bookId])
  const row = data[0]
  return {
    chapter: row ? aiShare(row.chapter_words ?? 0, row.chapter_ai_words ?? 0) : null,
    book: row ? aiShare(row.words ?? 0, row.ai_words ?? 0) : null,
  }
}

/** What a tool would work on as things stand, kept up as the writer moves the caret or selects. */
export function useToolTarget(tool: ToolDef, fields: FieldValues, plan: Plan, chapterId: string): string {
  const active = useActiveEditor()
  const sceneId = active?.sceneId ?? null
  const selectedWords =
    useEditorState({
      editor: active?.editor ?? null,
      selector: ({ editor }) => {
        if (!editor || editor.isDestroyed) return 0
        const { from, to } = editor.state.selection
        return from < to ? countWords(textBetween(editor.state.doc, from, to)) : 0
      },
    }) ?? 0
  const chapter = (sceneId && chapterOfScene(plan, sceneId)) || plan.chapterById.get(chapterId)
  return toolTarget(tool, fields, {
    sceneName: sceneId ? sceneNameIn(plan, sceneId) : null,
    selectedWords,
    chapterName: chapter ? chapterName(chapter) : null,
  })
}
