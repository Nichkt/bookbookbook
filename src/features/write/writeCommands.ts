import type { Editor } from "@tiptap/react"
import {
  AlignVerticalJustifyCenterIcon,
  BookOpenTextIcon,
  BookPlusIcon,
  BookUserIcon,
  CameraIcon,
  FileTextIcon,
  FocusIcon,
  HistoryIcon,
  MicIcon,
  MicOffIcon,
  Minimize2Icon,
  NotebookTextIcon,
  PanelLeftIcon,
  ScrollTextIcon,
  SearchIcon,
  SeparatorHorizontalIcon,
  Settings2Icon,
  SparklesIcon,
  TargetIcon,
  TextAlignCenterIcon,
  TextQuoteIcon,
  Volume2Icon,
  VolumeXIcon,
  WandSparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"
import { BUILTIN_TOOLS, type ToolDef } from "@/ai/tools"
import { activeEditor, editorContaining } from "@/editor/activeEditor"
import type { PaletteCommand } from "@/features/palette/commands"
import { usePaletteSource } from "@/features/palette/paletteStore"
import { byData, focusSoon } from "@/lib/focus"
import { isDictatingInto } from "@/speech/dictation"
import { openSpeechSetup } from "@/speech/settings"
import { addToWorldFromMenu } from "./addToWorld"
import { chooseTool, CONTINUE_KEYS, openAiSettings, openCustomTools, requestRun } from "./ai/aiState"
import { useCustomTools } from "./ai/useAi"
import { FIND_KEYS, openFind } from "./findActions"
import { FOCUS_KEYS, setFocusMode, useFocusMode } from "./focusMode"
import { openGoals } from "./goals"
import { SNAPSHOT_KEYS } from "./history"
import { takeSnapshot } from "./historyActions"
import { DICTATE_KEYS, dictateFromKeyboard, PROSE_TARGET } from "./proseDictation"
import { canReadAloud, READ_ALOUD_PLAY, startReading, stopReading, useReadAloud } from "./readAloud"
import { panelHeading, showHistory, switchTypewriter } from "./writeActions"
import {
  sceneNameIn,
  UNIT_LABELS,
  useWrite,
  useWritePlace,
  WRITE_UNITS,
  type PanelPage,
  type WriteContextValue,
  type WriteUnit,
} from "./writeContext"

export const UNIT_ICONS: Record<WriteUnit, LucideIcon> = {
  scene: FileTextIcon,
  chapter: BookOpenTextIcon,
  manuscript: ScrollTextIcon,
}

/** Formatting from the palette, in the text it was opened from, or last in. */
const inText = (action: (editor: Editor) => void) => () => {
  const target = activeEditor()?.editor
  if (target && !target.isDestroyed) action(target)
}

const UNIT_KEYWORDS: Record<WriteUnit, string[]> = {
  scene: ["one scene at a time"],
  chapter: ["whole chapter"],
  manuscript: ["whole book", "everything", "scroll"],
}

interface ScreenState {
  /** Whether the toolbar has room for every tool, and the chapters list shows. */
  wide: boolean
  focusMode: boolean
  customTools: readonly ToolDef[]
  chapterId: string
}

/**
 * The Write screen's part of the command palette (DESIGN.md §4): the toolbar's tools and its ⋯ menus', the views and
 * the AI tools. A chapter or scene picked in the palette comes into view here, and a World entry opens in the panel.
 */
export function useWriteCommands(wide: boolean) {
  const write = useWrite()
  const { chapterId } = useWritePlace()
  const focusMode = useFocusMode((state) => state.on)
  const custom = useCustomTools()
  usePaletteSource("write", {
    commands: () => writeCommands(write, { wide, focusMode, customTools: custom.tools, chapterId }),
    openChapter: (chapterId) => write.focusItem("chapter", chapterId),
    openScene: (sceneId) => write.focusItem("scene", sceneId),
    openEntry: (entryId) => {
      write.openEntryFromText(entryId)
      focusSoon(byData("codex-panel-heading", entryId))
    },
  })
}

function writeCommands(
  write: WriteContextValue,
  { wide, focusMode, customTools, chapterId }: ScreenState,
): PaletteCommand[] {
  const { db, plan, unit, setUnit, navOpen, toggleNav, setPanel, setPanelOpener } = write
  const { typewriter, setTypewriter } = write
  const editor = activeEditor()
  const dictating = isDictatingInto(PROSE_TARGET.id)
  const reading = useReadAloud.getState().status !== "idle"

  /** Opens the panel at a page and starts there; closed, it puts focus back in the text it was opened from. */
  const showPanel = (page: PanelPage, from: HTMLElement | null) => {
    setPanel(page)
    const opener = editorContaining(from)
    if (opener) setPanelOpener(opener)
    focusSoon(panelHeading(page, chapterId))
  }

  /** In the AI panel, from the text the palette was opened from, as Ctrl+J would. */
  const pickTool = (tool: ToolDef, from: HTMLElement | null) => {
    setPanel("ai")
    const opener = editorContaining(from)
    if (opener) setPanelOpener(opener)
    if (tool.id === "continue") requestRun(tool.id)
    else chooseTool(tool.id)
  }

  const commands: PaletteCommand[] = [
    {
      id: "write:focus-mode",
      label: focusMode ? "Leave focus mode" : "Focus mode",
      group: "Actions",
      keys: FOCUS_KEYS,
      icon: focusMode ? Minimize2Icon : FocusIcon,
      keywords: ["distraction free", "full screen", "zen", "hide everything"],
      run: () => setFocusMode(!focusMode),
    },
    {
      id: "write:find",
      label: "Find and replace",
      group: "Actions",
      keys: FIND_KEYS,
      icon: SearchIcon,
      keywords: ["search the book", "replace all"],
      run: () => openFind({ setPanel, setPanelOpener }),
    },
    {
      id: "write:dictate",
      label: dictating ? "Stop dictating" : "Dictate",
      group: "Actions",
      keys: DICTATE_KEYS,
      icon: dictating ? MicOffIcon : MicIcon,
      keywords: ["speech to text", "voice", "microphone", "talk", "say it"],
      disabled: !dictating && !editor,
      run: (from) => void dictateFromKeyboard(db, from),
    },
  ]
  if (canReadAloud()) {
    commands.push({
      id: "write:read-aloud",
      label: reading ? "Stop reading aloud" : "Read aloud",
      group: "Actions",
      icon: reading ? VolumeXIcon : Volume2Icon,
      keywords: ["listen", "text to speech", "speak", "hear it"],
      run: () => {
        if (reading) stopReading(true)
        else if (startReading()) focusSoon(READ_ALOUD_PLAY)
      },
    })
  }
  commands.push(
    {
      id: "write:typewriter",
      label: "Typewriter scrolling",
      group: "Actions",
      icon: AlignVerticalJustifyCenterIcon,
      checked: typewriter,
      keywords: ["keep the line in the middle", "centre", "center", "scroll"],
      run: () => switchTypewriter(!typewriter, setTypewriter),
    },
    {
      id: "write:goals",
      label: "Goals and sprints…",
      group: "Actions",
      icon: TargetIcon,
      keywords: ["daily goal", "word count", "streak", "timer", "today"],
      run: (from) => openGoals(from),
    },
    {
      id: "write:snapshot",
      label: "Save a snapshot",
      group: "Actions",
      keys: SNAPSHOT_KEYS,
      icon: CameraIcon,
      keywords: ["version", "history", "checkpoint", "save a copy"],
      disabled: !editor,
      run: () => {
        const target = activeEditor()
        if (target) void takeSnapshot(db, target.sceneId, sceneNameIn(plan, target.sceneId))
      },
    },
    {
      id: "write:history",
      label: "History…",
      group: "Actions",
      icon: HistoryIcon,
      keywords: ["versions", "snapshots", "restore", "compare", "earlier"],
      disabled: !editor,
      run: (from) => showHistory(plan, from),
    },
    {
      id: "write:panel:plan",
      label: "Show the chapter's plan",
      group: "Actions",
      icon: NotebookTextIcon,
      keywords: ["side panel", "chapter details", "moments", "summary", "notes"],
      run: (from) => showPanel("plan", from),
    },
    {
      id: "write:panel:world",
      label: "Show the World panel",
      group: "Actions",
      icon: BookUserIcon,
      keywords: ["side panel", "characters", "places", "names in this chapter"],
      run: (from) => showPanel("codex", from),
    },
    {
      id: "write:add-to-world",
      label: "Add to World…",
      group: "Actions",
      icon: BookPlusIcon,
      keywords: ["new character", "new place", "new entry", "selected name"],
      run: (from) => addToWorldFromMenu(from),
    },
  )
  if (wide && !focusMode) {
    commands.push({
      id: "write:chapters",
      label: navOpen ? "Hide chapters" : "Show chapters",
      group: "Actions",
      icon: PanelLeftIcon,
      keywords: ["chapter list", "navigator", "sidebar"],
      run: toggleNav,
    })
  }
  for (const name of WRITE_UNITS) {
    commands.push({
      id: `write:view:${name}`,
      label: `${UNIT_LABELS[name]} view`,
      group: "Actions",
      icon: UNIT_ICONS[name],
      checked: unit === name,
      keywords: ["view", "show", ...UNIT_KEYWORDS[name]],
      run: () => setUnit(name),
    })
  }
  commands.push(
    {
      id: "write:scene-break",
      label: "Scene break",
      group: "Actions",
      icon: SeparatorHorizontalIcon,
      keywords: ["format", "section break", "divider", "***"],
      disabled: !editor,
      searchOnly: true,
      run: inText((target) => target.chain().focus().setHorizontalRule().run()),
    },
    {
      id: "write:block-quote",
      label: "Block quote",
      group: "Actions",
      keys: "Mod+Shift+B",
      icon: TextQuoteIcon,
      keywords: ["format", "quotation", "indent", "letter"],
      disabled: !editor,
      searchOnly: true,
      run: inText((target) => target.chain().focus().toggleBlockquote().run()),
    },
    {
      id: "write:center",
      label: "Center",
      group: "Actions",
      keys: "Mod+Shift+E",
      icon: TextAlignCenterIcon,
      keywords: ["format", "centre", "align"],
      disabled: !editor,
      searchOnly: true,
      run: inText((target) => target.chain().focus().toggleTextAlign("center").run()),
    },
    {
      id: "write:speech-settings",
      label: "Dictation settings…",
      group: "Actions",
      icon: MicIcon,
      keywords: ["speech", "voice", "language", "microphone", "read aloud voice"],
      run: (from) => openSpeechSetup(null, from),
    },
  )

  // The AI tools: Continue runs at once, as Ctrl+J does; the others wait in the panel to be filled in and run.
  commands.push(
    ...[...BUILTIN_TOOLS, ...customTools].map(
      (tool): PaletteCommand => ({
        id: `write:ai:${tool.id}`,
        label: tool.id === "continue" ? tool.name : `${tool.name}…`,
        group: "AI tools",
        keys: tool.id === "continue" ? CONTINUE_KEYS : undefined,
        icon: tool.id === "continue" ? SparklesIcon : WandSparklesIcon,
        hint: tool.id === "continue" ? undefined : tool.group === "Your tools" ? "Your tool" : undefined,
        keywords: ["ai", tool.blurb],
        searchOnly: tool.id !== "continue",
        run: (from) => pickTool(tool, from),
      }),
    ),
    {
      id: "write:panel:ai",
      label: "Show the AI tools",
      group: "AI tools",
      icon: SparklesIcon,
      keywords: ["ai", "side panel", "results"],
      run: (from) => showPanel("ai", from),
    },
    {
      id: "write:ai-settings",
      label: "AI settings…",
      group: "AI tools",
      icon: Settings2Icon,
      keywords: ["ai", "set up", "provider", "model", "api key", "connect"],
      run: (from) => openAiSettings(from),
    },
    {
      id: "write:ai-custom",
      label: "Your own AI tools…",
      group: "AI tools",
      icon: WrenchIcon,
      keywords: ["ai", "custom", "make a tool", "prompt"],
      run: (from) => openCustomTools(from),
    },
  )
  return commands
}
