import { useQuery } from "@powersync/react"
import { CameraIcon, RotateCcwIcon } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { attempt } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loadVersion, VERSIONS_SQL, type VersionRow } from "@/db/versions"
import { useSceneDoc, useSceneText } from "@/editor/useSceneDoc"
import { focusSoon } from "@/lib/focus"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { proseText } from "@/yjs/prose"
import {
  closeHistory,
  diffParagraphs,
  formatWhen,
  restoreDiff,
  useHistoryDialog,
  versionName,
  type DiffPiece,
} from "./history"
import { restoreWithUndo, takeSnapshot } from "./historyActions"
import { useWrite } from "./writeContext"

/** A scene's versions, each compared with the text now, with snapshots and restore (DESIGN.md §8 "Snapshots"). */
export function HistoryDialog() {
  const { sceneId, sceneName, returnFocus } = useHistoryDialog()
  const content = useRef<HTMLDivElement>(null)
  // Keeps showing the scene while the dialog fades out.
  const [shown, setShown] = useState({ sceneId, sceneName })
  if (sceneId && (sceneId !== shown.sceneId || sceneName !== shown.sceneName)) setShown({ sceneId, sceneName })

  return (
    <Dialog open={!!sceneId} onOpenChange={(open) => !open && closeHistory()}>
      <DialogContent
        ref={content}
        className="flex max-h-[min(90svh,48rem)] flex-col gap-0 p-0 sm:max-w-4xl md:h-[min(85svh,44rem)]"
        onOpenAutoFocus={(event) => {
          // Start on the newest version rather than in the name field, which on a phone would raise the keyboard.
          event.preventDefault()
          content.current?.focus()
          focusSoon(`${VERSION_BUTTON}[aria-pressed="true"]`)
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocus?.isConnected) return
          event.preventDefault()
          returnFocus.focus()
        }}
      >
        {shown.sceneId && <HistoryBody key={shown.sceneId} sceneId={shown.sceneId} sceneName={shown.sceneName} />}
      </DialogContent>
    </Dialog>
  )
}

const VERSION_BUTTON = "[data-history-version]"

function HistoryBody({ sceneId, sceneName }: { sceneId: string; sceneName: string }) {
  const { db } = useWrite()
  const versions = useQuery<VersionRow>(VERSIONS_SQL, [sceneId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = versions.data.find((version) => version.id === selectedId) ?? versions.data[0] ?? null

  const restore = () => {
    if (!selected) return
    closeHistory()
    void restoreWithUndo(db, sceneId, selected, sceneName)
  }

  return (
    <>
      <DialogHeader className="border-b p-4 pr-12">
        <DialogTitle>History of {sceneName}</DialogTitle>
        <DialogDescription>
          Versions save themselves: the text as it was when you start editing, then every ten minutes while you write,
          and when you leave the scene. Take a snapshot to save one with a name.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
        <div className="border-b md:overflow-y-auto md:border-r md:border-b-0">
          <SnapshotForm sceneId={sceneId} sceneName={sceneName} onSaved={setSelectedId} />
          {versions.data.length > 0 && (
            <ul aria-label="Versions" className="space-y-0.5 p-2">
              {versions.data.map((version) => {
                const current = version.id === selected?.id
                return (
                  <li key={version.id}>
                    <button
                      data-history-version={version.id}
                      type="button"
                      aria-pressed={current}
                      onClick={() => setSelectedId(version.id)}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left hover:bg-accent pointer-coarse:min-h-11",
                        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        current && "bg-accent",
                      )}
                    >
                      <span className={cn("block truncate text-sm text-ink", current && "font-medium")}>
                        {versionName(version)}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {formatWhen(version.created_at)} · {formatCount(version.word_count ?? 0)} words
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {selected ? (
          <Preview key={selected.id} sceneId={sceneId} version={selected} onRestore={restore} />
        ) : (
          !versions.isLoading && (
            <div className="grid place-content-center gap-1 p-6 text-center">
              <p className="font-medium text-ink">No versions yet</p>
              <p className="text-sm text-muted-foreground">The first is saved as soon as you start writing here.</p>
            </div>
          )
        )}
      </div>
    </>
  )
}

function SnapshotForm({
  sceneId,
  sceneName,
  onSaved,
}: {
  sceneId: string
  sceneName: string
  onSaved: (versionId: string) => void
}) {
  const { db } = useWrite()
  const id = useId()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const versionId = await takeSnapshot(db, sceneId, sceneName, name)
    setSaving(false)
    if (!versionId) return
    setName("")
    onSaved(versionId)
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-2 border-b p-4">
      <Label htmlFor={id}>Snapshot name (optional)</Label>
      <Input
        id={id}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Before the rewrite"
        autoComplete="off"
      />
      <Button type="submit" variant="outline" disabled={saving} className="justify-self-start">
        <CameraIcon />
        Take snapshot
      </Button>
    </form>
  )
}

function Preview({ sceneId, version, onRestore }: { sceneId: string; version: VersionRow; onRestore: () => void }) {
  const provider = useSceneDoc(sceneId)
  const current = useSceneText(provider)
  const text = useVersionText(version.id)
  const diff = useMemo(
    () => (current === null || typeof text !== "string" ? null : restoreDiff(current, text)),
    [current, text],
  )
  const same = current !== null && current === text

  let summary: string
  if (text === null) summary = "That version is gone."
  else if (!diff) summary = "Comparing…"
  else if (same) summary = "This version is the same as the scene now."
  else if (!diff.parts) summary = "Too different to compare word by word, so here is the version as it was."
  else if (diff.added === 0 && diff.removed === 0) summary = "Restoring changes only spacing and line breaks."
  else if (diff.removed === 0) summary = `Restoring brings back ${words(diff.added)}.`
  else if (diff.added === 0) summary = `Restoring takes out ${words(diff.removed)}.`
  else summary = `Restoring brings back ${words(diff.added)} and takes out ${words(diff.removed)}.`

  return (
    <section aria-label="Compared with the scene now" className="flex flex-col md:min-h-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-4">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm text-ink-2">
          {summary}
        </p>
        <Button size="sm" onClick={onRestore} disabled={!diff || same}>
          <RotateCcwIcon />
          Restore this version
        </Button>
      </div>
      <div className="space-y-2 p-4 font-serif text-[15px] leading-relaxed text-ink md:min-h-0 md:flex-1 md:overflow-y-auto">
        {diff?.parts && !same ? (
          <>
            <p className="mb-3 font-sans text-xs text-muted-foreground">
              Underlined words come back if you restore. Struck-through words go.
            </p>
            <Paragraphs paragraphs={diffParagraphs(diff.parts)} />
          </>
        ) : (
          typeof text === "string" && (
            <Paragraphs paragraphs={diffParagraphs([{ value: text, added: false, removed: false }])} />
          )
        )}
      </div>
    </section>
  )
}

function Paragraphs({ paragraphs }: { paragraphs: DiffPiece[][] }) {
  return paragraphs.map((pieces, index) => (
    <p key={index} className="whitespace-pre-wrap">
      {pieces.length === 0 ? (
        <br />
      ) : (
        pieces.map((piece, at) =>
          piece.change === "added" ? (
            <ins key={at} className="bg-status-done/15 underline decoration-status-done decoration-2 underline-offset-2">
              <span className="sr-only">added: </span>
              {piece.text}
            </ins>
          ) : piece.change === "removed" ? (
            <del key={at} className="bg-destructive/10 text-ink-2 line-through">
              <span className="sr-only">removed: </span>
              {piece.text}
            </del>
          ) : (
            <span key={at}>{piece.text}</span>
          ),
        )
      )}
    </p>
  ))
}

const words = (count: number) => `${formatCount(count)} ${count === 1 ? "word" : "words"}`

/** A version's text, loaded once: undefined while loading, null if the version is gone. */
function useVersionText(versionId: string): string | null | undefined {
  const { db } = useWrite()
  const [loaded, setLoaded] = useState<{ versionId: string; text: string | null } | null>(null)
  useEffect(() => {
    let active = true
    void attempt("load version", loadVersion(db, versionId)).then((doc) => {
      if (doc === undefined) return
      const text = doc ? proseText(doc) : null
      doc?.destroy()
      if (active) setLoaded({ versionId, text })
    })
    return () => {
      active = false
    }
  }, [db, versionId])
  return loaded?.versionId === versionId ? loaded.text : undefined
}
