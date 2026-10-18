import { isChangeOrigin } from "@tiptap/extension-collaboration"
import { useEditorState, type Editor } from "@tiptap/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useCurrentBook } from "@/app/books"
import { Button } from "@/components/ui/button"
import { mentionHighlightKey } from "@/editor/extensions/MentionHighlight"
import { SceneEditor } from "@/editor/SceneEditor"
import { DEFAULT_FEATURES, type SceneEditorFeatures } from "@/editor/sceneExtensions"
import { useMentionMatcher } from "@/editor/useMentionMatcher"
import { useSceneDoc } from "@/editor/useSceneDoc"
import { cn } from "@/lib/utils"

/** The lab writes to its own scene doc, outside any book. */
const LAB_SCENE_ID = "lab-ime"
const MAX_ENTRIES = 400

const FEATURE_LABELS: { key: keyof SceneEditorFeatures; label: string; hint: string }[] = [
  { key: "mentions", label: "Mention highlights", hint: "Dotted underline on names from your world" },
  { key: "guardComposition", label: "Composition guard", hint: "Hold highlights still while the keyboard composes" },
  { key: "typography", label: "Smart typography", hint: "Curly quotes, em dashes, ellipses" },
]

interface LogEntry {
  id: number
  at: number
  type: string
  detail: string
}

type SyncState = "unchecked" | "match" | "mismatch"

interface SyncReport {
  text: boolean
  highlights: boolean
  wanted: string
  shown: string
}

function useEventLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const pending = useRef<LogEntry[]>([])
  const frame = useRef<number | undefined>(undefined)
  const start = useRef(0)
  const nextId = useRef(0)

  const add = useCallback((type: string, detail = "") => {
    if (start.current === 0) start.current = performance.now()
    pending.current.push({ id: nextId.current++, at: performance.now() - start.current, type, detail })
    // Composition can fire dozens of events a second; render at most once a frame.
    frame.current ??= requestAnimationFrame(() => {
      frame.current = undefined
      const batch = pending.current
      pending.current = []
      setEntries((previous) => [...previous, ...batch].slice(-MAX_ENTRIES))
    })
  }, [])

  const clear = useCallback(() => {
    pending.current = []
    start.current = 0
    setEntries([])
  }, [])

  useEffect(() => () => cancelAnimationFrame(frame.current ?? 0), [])
  return { entries, add, clear }
}

const quote = (text: string | null) => (text === null ? "null" : JSON.stringify(text))

function describe(event: Event): string {
  if (event instanceof InputEvent) {
    const range = event.type === "beforeinput" ? event.getTargetRanges()[0] : undefined
    const target = range ? ` target=${range.startOffset}-${range.endOffset}` : ""
    return `${event.inputType} data=${quote(event.data)}${event.isComposing ? " composing" : ""}${target}`
  }
  if (event instanceof CompositionEvent) return `data=${quote(event.data)}`
  if (event instanceof KeyboardEvent) {
    return `key=${quote(event.key)} code=${event.code || "-"} keyCode=${event.keyCode}${event.isComposing ? " composing" : ""}`
  }
  return ""
}

/**
 * Compares the screen with ProseMirror, block by block, and the underlined names with the highlights the plugin
 * holds. Recomputing highlights mid-composition leaves stale underlines that never heal, even on desktop.
 */
function checkSync(editor: Editor): SyncReport {
  const clean = (text: string) => text.replace(/[\u200b\ufeff]/g, "")
  const dom = Array.from(editor.view.dom.children, (element) => clean(element.textContent ?? ""))
  const model: string[] = []
  editor.state.doc.forEach((node) => model.push(node.textContent))
  const decorations = mentionHighlightKey.getState(editor.state)?.decorations.find() ?? []
  const wanted = decorations.map((decoration) => editor.state.doc.textBetween(decoration.from, decoration.to)).join("|")
  const shown = Array.from(editor.view.dom.querySelectorAll(".mention-auto"), (span) => span.textContent).join("|")
  return {
    text: dom.length === model.length && dom.every((text, index) => text === model[index]),
    // A highlight split by formatting renders as several spans, so compare the characters only.
    highlights: wanted.replaceAll("|", "") === shown.replaceAll("|", ""),
    wanted,
    shown,
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The async clipboard can be refused (permission prompt dismissed, page not focused): use a hidden textarea.
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.append(area)
    area.select()
    const copied = document.execCommand("copy")
    area.remove()
    return copied
  }
}

/** M0's Android IME smoke test (DESIGN.md §16, §20). Checklist: docs/ime-smoke-test.md. */
export function ImeLab() {
  const { book } = useCurrentBook()
  const matcher = useMentionMatcher(book?.id)
  const provider = useSceneDoc(LAB_SCENE_ID)
  const [features, setFeatures] = useState<SceneEditorFeatures>(DEFAULT_FEATURES)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [composing, setComposing] = useState(false)
  const [sync, setSync] = useState<{ text: SyncState; highlights: SyncState }>({
    text: "unchecked",
    highlights: "unchecked",
  })
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  // `navigator.storage` is missing in some embedded and older browsers.
  const [persisted, setPersisted] = useState(() => (navigator.storage ? "checking…" : "unsupported"))
  const { entries, add, clear } = useEventLog()

  const modelText = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current ? current.state.doc.textBetween(0, current.state.doc.content.size, "\n", "⏎") : "",
  })

  useEffect(() => {
    navigator.storage?.persisted?.().then(
      (value) => setPersisted(value ? "yes" : "no"),
      () => setPersisted("unknown"),
    )
  }, [])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    let checkTimer: ReturnType<typeof setTimeout> | undefined
    let lastProblem = ""
    const scheduleCheck = (delay: number) => {
      clearTimeout(checkTimer)
      checkTimer = setTimeout(() => {
        if (editor.isDestroyed || editor.view.composing) return
        const report = checkSync(editor)
        setSync({ text: report.text ? "match" : "mismatch", highlights: report.highlights ? "match" : "mismatch" })
        const problems = [
          !report.text && "screen text differs from the model: note what you just typed",
          !report.highlights && `stale underlines: screen ${quote(report.shown)}, plugin ${quote(report.wanted)}`,
        ].filter(Boolean)
        // Log each new problem once, not on every keystroke while it lasts.
        const problem = problems.join(" · ")
        if (problem && problem !== lastProblem) add("MISMATCH", problem)
        lastProblem = problem
      }, delay)
    }

    const onDomEvent = (event: Event) => {
      add(event.type, describe(event))
      if (event.type === "compositionstart") setComposing(true)
      if (event.type === "compositionend") {
        setComposing(false)
        scheduleCheck(300)
      }
      if (event.type === "input" && !editor.view.composing) scheduleCheck(300)
    }
    const domEvents = ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "keydown", "keyup"]
    for (const type of domEvents) dom.addEventListener(type, onDomEvent, true)

    const onSelection = () => {
      const selection = document.getSelection()
      if (!selection?.anchorNode || !dom.contains(selection.anchorNode)) return
      const { from, to } = editor.state.selection
      add("selectionchange", `dom ${selection.anchorOffset}→${selection.focusOffset} · pm ${from}-${to}`)
    }
    document.addEventListener("selectionchange", onSelection)

    const onTransaction = ({ transaction }: { transaction: Editor["state"]["tr"] }) => {
      const mentionMeta = transaction.getMeta(mentionHighlightKey) as { refresh?: boolean } | undefined
      if (mentionMeta?.refresh) {
        const count = mentionHighlightKey.getState(editor.state)?.decorations.find().length ?? 0
        add("mentions", `recomputed: ${count} highlighted`)
      }
      if (!transaction.docChanged) return
      const composition = transaction.getMeta("composition") as number | undefined
      const origin = isChangeOrigin(transaction) ? "yjs" : "local"
      add("pm", `steps=${transaction.steps.length} origin=${origin}${composition != null ? ` composition=${composition}` : ""}`)
    }
    editor.on("transaction", onTransaction)
    add("editor", `ready · ${Object.entries(features).map(([key, on]) => `${key}=${on ? "on" : "off"}`).join(" ")}`)

    return () => {
      clearTimeout(checkTimer)
      for (const type of domEvents) dom.removeEventListener(type, onDomEvent, true)
      document.removeEventListener("selectionchange", onSelection)
      editor.off("transaction", onTransaction)
    }
    // `features` is only logged; a change rebuilds the editor, which re-runs this.
  }, [editor, add]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: keyof SceneEditorFeatures) => setFeatures((current) => ({ ...current, [key]: !current[key] }))

  const environment = [
    `userAgent: ${navigator.userAgent}`,
    `secureContext: ${window.isSecureContext}`,
    `storage persisted: ${persisted}`,
    `features: ${JSON.stringify(features)}`,
  ]

  const copyLog = async () => {
    const lines = entries.map((entry) => `${entry.at.toFixed(0).padStart(7)}ms  ${entry.type.padEnd(17)} ${entry.detail}`)
    const summary = [`model text: ${JSON.stringify(modelText)}`, `last check: text=${sync.text} underlines=${sync.highlights}`]
    const ok = await copyText([...environment, ...summary, "", ...lines].join("\n"))
    setCopyState(ok ? "copied" : "failed")
    setTimeout(() => setCopyState("idle"), 2000)
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:py-10">
      <header>
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">M0 · risk spike</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold">IME lab</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Type with your phone keyboard. Codex names like <em>Mara</em>, <em>Jonas Quill</em> and{" "}
          <em>Grayhaven Light</em> get a dotted underline. Watch for doubled letters, a jumping caret or lost words.
          Full steps are in <code className="text-xs">docs/ime-smoke-test.md</code>.
        </p>
      </header>

      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Editor features</legend>
        {FEATURE_LABELS.map(({ key, label, hint }) => (
          <label key={key} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border bg-surface p-3">
            <input
              type="checkbox"
              checked={features[key]}
              disabled={key === "guardComposition" && !features.mentions}
              onChange={() => toggle(key)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="rounded-lg border bg-page px-5 py-4 shadow-xs">
        {provider ? (
          <SceneEditor
            provider={provider}
            matcher={matcher}
            label="IME test text"
            features={features}
            placeholder="Try: Mara's brother Jonas Quill waited by Grayhaven Light."
            onEditor={setEditor}
          />
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-surface-2/60" aria-busy="true" aria-label="Loading" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div role="status" className="flex flex-wrap gap-2">
          <StatusPill state={sync.text} labels={["Text not checked", "Text: screen = model", "Text: screen ≠ model"]} />
          <StatusPill
            state={sync.highlights}
            labels={["Underlines not checked", "Underlines in sync", "Underlines stale"]}
          />
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 font-medium",
              composing ? "border-primary/40 text-primary" : "text-muted-foreground",
            )}
          >
            {composing ? "Composing" : "Not composing"}
          </span>
        </div>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void copyLog()}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy log"}
          </Button>
          <Button size="sm" variant="outline" onClick={clear}>
            Clear log
          </Button>
          <Button size="sm" variant="outline" disabled={!editor} onClick={() => editor?.chain().clearContent().focus().run()}>
            Clear text
          </Button>
        </span>
      </div>

      <details className="rounded-lg border bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-medium">Model text</summary>
        <pre className="mt-2 font-mono text-xs break-words whitespace-pre-wrap">{modelText || "(empty)"}</pre>
      </details>

      <div className="rounded-lg border bg-surface">
        <h2 className="border-b px-3 py-2 text-sm font-medium">
          Event log <span className="font-normal text-muted-foreground">(newest first)</span>
        </h2>
        <ol className="max-h-96 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-5" aria-label="Event log">
          {entries.length === 0 && <li className="text-muted-foreground">Type in the box above.</li>}
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className={entry.type === "MISMATCH" ? "font-semibold text-destructive" : undefined}>
              <span className="text-muted-foreground tabular-nums">{entry.at.toFixed(0).padStart(6)}ms</span>{" "}
              <span className="font-semibold">{entry.type}</span> {entry.detail}
            </li>
          ))}
        </ol>
      </div>

      <ul className="space-y-0.5 text-xs break-all text-muted-foreground">
        {environment.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}

/** Labels are for unchecked, match and mismatch, in that order. */
function StatusPill({ state, labels }: { state: SyncState; labels: [string, string, string] }) {
  const [label, tone] = {
    unchecked: [labels[0], "text-muted-foreground"],
    match: [labels[1], "border-status-done/40 text-status-done"],
    mismatch: [labels[2], "border-destructive/50 bg-destructive/10 text-destructive"],
  }[state]
  return <span className={cn("rounded-full border px-2.5 py-1 font-medium", tone)}>{label}</span>
}
