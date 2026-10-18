import { useEditorState, type Editor } from "@tiptap/react"
import { BoldIcon, BookPlusIcon, ItalicIcon, Redo2Icon, Undo2Icon, type LucideIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { editorContaining, useEditors } from "@/editor/activeEditor"
import { useKeyboard, type KeyboardFrame } from "@/lib/keyboard"
import { ariaShortcut, shortcutLabel } from "@/lib/keys"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { offersToAdd, openAddToWorld, selectedName } from "./addToWorld"
import { useFocusMode } from "./focusMode"
import { toggleBold, toggleItalic, useFormatState } from "./formatting"
import { DictateProse, Divider, FormatToggle } from "./ToolbarParts"
import { useWrite } from "./writeContext"

/**
 * Writing tools docked above the on-screen keyboard while the writer types on a touch screen (DESIGN.md §16). There
 * the system's own menu takes the space over a selection, and the toolbar at the top has often scrolled away. Focus
 * mode hides them with the rest of the chrome.
 */
export function DockedTools() {
  const coarse = useMediaQuery("(pointer: coarse)")
  const focusMode = useFocusMode((state) => state.on)
  const watching = coarse && !focusMode
  const keyboard = useKeyboard(watching)
  const editor = useEditorWithFocus(watching)
  return keyboard.open && editor ? <DockedBar editor={editor} frame={keyboard} /> : null
}

/** The scene editor with focus, if one has it, while `watching`. */
function useEditorWithFocus(watching: boolean): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null)
  useEffect(() => {
    if (!watching) return
    const update = (element: EventTarget | null) => setEditor(editorContaining(element as Element | null))
    // On the way out, focus's next stop: the bar shouldn't go between one scene and the next.
    const onFocusIn = (event: FocusEvent) => update(event.target)
    const onFocusOut = (event: FocusEvent) => update(event.relatedTarget)
    update(document.activeElement)
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    // Scenes come and go as the writer moves through the book, focus or no.
    const unsubscribe = useEditors.subscribe(() => update(document.activeElement))
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      unsubscribe()
      setEditor(null)
    }
  }, [watching])
  return watching ? editor : null
}

interface EditState {
  /** The name selected in the text, if it looks like one. Not while a word is still being composed. */
  name: string
  undo: boolean
  redo: boolean
}

const NO_EDITS: EditState = { name: "", undo: false, redo: false }

/** Between the bar and the toasts and bars that float above it. */
const FLOAT_GAP = 16
/** Between the caret and the bar, when the caret has to be kept from going behind it. */
const CARET_ROOM = 8

function DockedBar({ editor, frame }: { editor: Editor; frame: KeyboardFrame }) {
  const { matcher, matcherLoading } = useWrite()
  const format = useFormatState(editor)
  const edits =
    useEditorState({
      editor,
      selector: ({ editor: current }): EditState =>
        current.isDestroyed
          ? NO_EDITS
          : {
              name: current.view.composing ? "" : selectedName(current.state),
              undo: current.can().undo(),
              redo: current.can().redo(),
            },
    }) ?? NO_EDITS
  const offer = !matcherLoading && offersToAdd(matcher, edits.name)
  const bar = useRef<HTMLDivElement>(null)
  const tools = useRef<HTMLDivElement>(null)

  // Toasts, and what else floats at the foot of the window, rise above the bar; the tab bar makes way (index.css).
  // In pixels, as some read --toast-bottom to know where those are.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-keyboard-tools", "")
    root.style.setProperty("--toast-bottom", `${frame.lift + (bar.current?.offsetHeight ?? 0) + FLOAT_GAP}px`)
    return () => {
      root.removeAttribute("data-keyboard-tools")
      root.style.removeProperty("--toast-bottom")
    }
  }, [frame.lift])

  // ProseMirror keeps the caret in the part of the page in sight, and so above the keyboard; this keeps it above the
  // bar too. The other edges keep ProseMirror's defaults.
  useLayoutEffect(() => {
    const { view } = editor
    const clear = (bar.current?.offsetHeight ?? 0) + CARET_ROOM
    const { scrollThreshold, scrollMargin } = view.props
    view.setProps({
      scrollThreshold: { top: 0, right: 0, bottom: clear, left: 0 },
      scrollMargin: { top: 5, right: 5, bottom: clear, left: 5 },
    })
    return () => {
      if (!view.isDestroyed) view.setProps({ scrollThreshold, scrollMargin })
    }
  }, [editor])

  // As the keyboard comes up, or changes height, the browser brings the caret into sight, maybe behind the bar.
  useLayoutEffect(() => {
    if (!editor.view.composing) editor.commands.scrollIntoView()
  }, [editor, frame.height])

  // The offer comes in first in line, which may have scrolled out of sight.
  useLayoutEffect(() => {
    if (offer) tools.current?.scrollTo({ left: 0 })
  }, [offer])

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Writing tools"
      data-docked-tools=""
      style={{ top: frame.bottom, left: frame.left, width: frame.width }}
      // Keeps focus in the text, and so the keyboard up and the selection showing.
      onMouseDown={(event) => event.preventDefault()}
      className="fixed z-40 flex -translate-y-full items-center gap-1 border-t bg-surface/95 px-2 py-1 font-sans backdrop-blur"
    >
      <div ref={tools} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {offer && (
          <Button variant="outline" size="sm" onClick={() => openAddToWorld(editor)} className="shrink-0">
            <BookPlusIcon />
            Add to World
          </Button>
        )}
        <DockButton
          label="Undo"
          keys="Mod+Z"
          icon={Undo2Icon}
          disabled={!edits.undo}
          onClick={() => editor.commands.undo()}
        />
        <DockButton
          label="Redo"
          keys="Mod+Shift+Z"
          icon={Redo2Icon}
          disabled={!edits.redo}
          onClick={() => editor.commands.redo()}
        />
        <Divider />
        <FormatToggle
          label="Bold"
          keys="Mod+B"
          icon={BoldIcon}
          pressed={format.bold}
          editor={editor}
          run={toggleBold}
        />
        <FormatToggle
          label="Italic"
          keys="Mod+I"
          icon={ItalicIcon}
          pressed={format.italic}
          editor={editor}
          run={toggleItalic}
        />
        <Divider />
        <DictateProse editor={editor} size="icon-sm" labelClassName="sr-only" />
      </div>
      <Button variant="ghost" size="sm" onClick={() => editor.commands.blur()} className="shrink-0 text-ink-2">
        Done
      </Button>
    </div>
  )
}

interface DockButtonProps {
  label: string
  /** As shortcutLabel takes them. */
  keys: string
  icon: LucideIcon
  disabled: boolean
  onClick: () => void
}

function DockButton({ label, keys, icon: Icon, disabled, onClick }: DockButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-keyshortcuts={ariaShortcut(keys)}
          disabled={disabled}
          onClick={onClick}
          className="shrink-0 text-ink-2"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label} · {shortcutLabel(keys)}
      </TooltipContent>
    </Tooltip>
  )
}
