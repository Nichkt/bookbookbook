import { usePowerSync } from "@powersync/react"
import { PluginKey } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus"
import { BookPlusIcon } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { announce, attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { usePref } from "@/db/prefs"
import { TypeIcon } from "@/features/codex/CodexIcons"
import { useCodex, type Codex } from "@/features/codex/codexData"
import { createEntry } from "@/features/codex/mutations"
import { nextColor } from "@/lib/palette"
import {
  aliasSuggestions,
  closeAddToWorld,
  defaultTypeId,
  entryNamed,
  offersToAdd,
  openAddToWorld,
  returnFromAddToWorld,
  selectedName,
  useAddToWorld,
  WORLD_TYPE_PREF,
} from "./addToWorld"
import { useWrite } from "./writeContext"

interface AddToWorldDialogProps {
  bookId: string
  /** Shows an entry the dialog added, or found already in the World, where the screen shows entries. */
  showEntry: (entryId: string) => void
}

/** Adds the entry, its type remembered for next time, and says so with a way to see it (DESIGN.md §7). */
export function AddToWorldDialog({ bookId, showEntry }: AddToWorldDialogProps) {
  const open = useAddToWorld((state) => state.open)
  const session = useAddToWorld((state) => state.session)
  // Loaded before the dialog opens, so its type list and duplicate check are ready at once.
  const codex = useCodex(bookId)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeAddToWorld()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (returnFromAddToWorld()) event.preventDefault()
        }}
      >
        <AddToWorldForm key={session} codex={codex} bookId={bookId} showEntry={showEntry} />
      </DialogContent>
    </Dialog>
  )
}

function AddToWorldForm({ codex, bookId, showEntry }: AddToWorldDialogProps & { codex: Codex }) {
  const db = usePowerSync()
  const startName = useAddToWorld((state) => state.name)
  const startNotes = useAddToWorld((state) => state.notes)
  const typeKey = useAddToWorld((state) => state.typeKey)
  const lastType = usePref(WORLD_TYPE_PREF)
  const id = useId()
  const nameInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(startName)
  const [pickedType, setPickedType] = useState<string | null>(null)
  const [aliases, setAliases] = useState<readonly string[]>([])
  const [notes, setNotes] = useState(startNotes)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const typeId = pickedType ?? defaultTypeId(codex.types, lastType.value, typeKey)
  const type = typeId ? codex.typeById.get(typeId) : undefined
  const trimmed = name.trim()
  const existing = entryNamed(codex.entries, trimmed)
  const suggestions = aliasSuggestions(trimmed).filter((alias) => !entryNamed(codex.entries, alias))
  const showError = tried && !trimmed

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setTried(true)
    if (!trimmed) {
      announce("Give it a name.")
      nameInput.current?.focus()
      return
    }
    if (!typeId) return
    setBusy(true)
    const color = nextColor((codex.entriesByType.get(typeId) ?? []).map((entry) => entry.color))
    const entryId = await attempt(
      "add to world",
      createEntry(db, {
        bookId,
        typeId,
        name: trimmed,
        color,
        aliases: aliases.filter((alias) => suggestions.includes(alias)),
        notes,
      }),
    )
    setBusy(false)
    if (!entryId) return
    void lastType.setValue(typeId)
    const then = useAddToWorld.getState().onAdded?.(entryId)
    closeAddToWorld("caret", then ?? null)
    toast(`Added “${trimmed}” to the World.`, {
      action: {
        label: "Details",
        onClick: () => {
          // As offerUndo does: let Sonner hand focus back now, not after the World page takes it.
          const active = document.activeElement
          if (active instanceof HTMLElement && active.closest("[data-sonner-toaster]")) active.blur()
          showEntry(entryId)
        },
      },
    })
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add to World</DialogTitle>
        <DialogDescription>A new entry for this book's World. Fill in more on the World page any time.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          ref={nameInput}
          id={`${id}-name`}
          autoFocus
          autoComplete="off"
          placeholder="Mara Quill"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-error` : existing ? `${id}-existing` : undefined}
        />
        {showError && (
          <p id={`${id}-error`} className="text-sm text-destructive">
            Give it a name.
          </p>
        )}
        {!showError && existing && (
          <p id={`${id}-existing`} className="text-sm text-muted-foreground">
            The World already has “{existing.name}”. Two entries with one name are never underlined.{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 align-baseline"
              onClick={() => closeAddToWorld("text", () => showEntry(existing.id))}
            >
              Show it
            </Button>
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-type`}>Type</Label>
        <Select value={typeId ?? ""} onValueChange={setPickedType}>
          <SelectTrigger id={`${id}-type`} aria-describedby={type && !type.tracked ? `${id}-type-hint` : undefined}>
            <SelectValue placeholder="Choose a type" />
          </SelectTrigger>
          <SelectContent position="popper">
            {codex.types.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <TypeIcon icon={option.icon} className="text-muted-foreground" />
                {option.singular}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {type && !type.tracked && (
          <p id={`${id}-type-hint`} className="text-xs text-muted-foreground">
            The text doesn't underline {type.name.toLowerCase()}, since their names are often everyday words.
          </p>
        )}
      </div>
      {suggestions.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm leading-none font-medium">Also known as</legend>
          {suggestions.map((alias) => {
            const checkboxId = `${id}-alias-${alias}`
            return (
              <div key={alias} className="flex items-center gap-2 pointer-coarse:min-h-11">
                <Checkbox
                  id={checkboxId}
                  checked={aliases.includes(alias)}
                  onCheckedChange={(checked) =>
                    setAliases((current) =>
                      checked === true ? [...current, alias] : current.filter((other) => other !== alias),
                    )
                  }
                />
                <Label htmlFor={checkboxId} className="font-normal">
                  {alias}
                </Label>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">The text underlines these too.</p>
        </fieldset>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-notes`}>
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${id}-notes`}
          rows={3}
          placeholder="A line or two to remember it by."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy || !typeId}>
          Add to World
        </Button>
      </DialogFooter>
    </form>
  )
}

type ShouldShow = NonNullable<BubbleMenuProps["shouldShow"]>

const BUBBLE_OPTIONS: BubbleMenuProps["options"] = { placement: "top", offset: 8, flip: true, shift: { padding: 8 } }

const coarsePointer = () => window.matchMedia("(pointer: coarse)").matches

/**
 * "Add to World" over a selected name, for a mouse or a keyboard (Tab reaches it from the text). Touch screens leave
 * the space to the system's own selection menu and use the ⋯ menu's item instead (DESIGN.md §16).
 */
export function AddToWorldBubble({ editor }: { editor: Editor }) {
  const { matcher, matcherLoading } = useWrite()
  // Null until the World's names load, as until then every name would look new.
  const latestMatcher = useRef(matcherLoading ? null : matcher)
  const [pluginKey] = useState(() => new PluginKey("addToWorld"))
  // A selection the writer dismissed the bubble from with Esc, which it stays away from.
  const dismissed = useRef<{ from: number; to: number } | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  // TipTap makes the menu itself a tab stop, an unlabelled one before the button. This runs after the BubbleMenu's
  // effect that sets that up, as a parent's effects follow its children's.
  useEffect(() => {
    if (menu.current) menu.current.tabIndex = -1
  }, [editor])

  const offers = useCallback((current: Editor, element: HTMLElement) => {
    // TipTap may still ask once the editor has gone, from a timer it leaves running.
    if (current.isDestroyed) return false
    const { view, state } = current
    const { from, to } = state.selection
    if (dismissed.current && (dismissed.current.from !== from || dismissed.current.to !== to)) dismissed.current = null
    if (dismissed.current || !current.isEditable || view.composing || coarsePointer()) return false
    if (!view.hasFocus() && !element.contains(document.activeElement)) return false
    return latestMatcher.current !== null && offersToAdd(latestMatcher.current, selectedName(state))
  }, [])
  const shouldShow = useCallback<ShouldShow>(({ editor: current, element }) => offers(current, element), [offers])

  // TipTap asks only as the selection changes, so a name selected before the World's names loaded, or one the World
  // has gained since, is looked at again as they change.
  useEffect(() => {
    latestMatcher.current = matcherLoading ? null : matcher
    const element = menu.current
    if (!element || editor.isDestroyed || editor.view.composing || editor.state.selection.empty) return
    const show = offers(editor, element)
    if (show !== element.isConnected) editor.view.dispatch(editor.state.tr.setMeta(pluginKey, show ? "show" : "hide"))
  }, [editor, matcher, matcherLoading, offers, pluginKey])

  return (
    <BubbleMenu
      ref={menu}
      editor={editor}
      pluginKey={pluginKey}
      shouldShow={shouldShow}
      options={BUBBLE_OPTIONS}
      className="z-10 font-sans"
      data-add-to-world=""
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="bg-popover shadow-md dark:bg-popover"
        // Keeps the text focused, with its selection showing, until the dialog opens.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => openAddToWorld(editor)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || editor.isDestroyed) return
          event.preventDefault()
          const { from, to } = editor.state.selection
          dismissed.current = { from, to }
          editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "hide"))
          editor.commands.focus()
        }}
      >
        <BookPlusIcon />
        Add to World
      </Button>
    </BubbleMenu>
  )
}
