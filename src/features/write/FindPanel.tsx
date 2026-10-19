import {
  CaseSensitiveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RegexIcon,
  WholeWordIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useEditors } from "@/editor/activeEditor"
import { snippetOf } from "@/editor/find"
import { TermHint } from "@/features/help/TermHint"
import { chapterTitle } from "@/features/plan/status"
import { byData } from "@/lib/focus"
import { isComposing, shortcutLabel } from "@/lib/keys"
import { formatCount } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import {
  isFindShortcut,
  loadSceneTexts,
  replaceAll,
  replaceCurrent,
  revealMatch,
  searchOf,
  setFindOption,
  setFindQuery,
  setReplacement,
  showSearch,
  showSearchIn,
  startFindSession,
  stepMatch,
  useFind,
  type FindOption,
  type FindPage,
} from "./findActions"
import { bookResults, findStatus, groupResults, indexOfTarget, LIST_LIMIT, namesScenes, type BookMatch } from "./findData"
import { sceneLabel, useWrite, useWritePlace } from "./writeContext"

const RESULT =
  "w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-accent hover:text-ink pointer-coarse:min-h-11 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

interface OptionInfo {
  option: FindOption
  label: string
  /** What it does, in its tooltip. */
  hint: string
  icon: LucideIcon
}

const OPTIONS: OptionInfo[] = [
  { option: "matchCase", label: "Match case", hint: "Finds “Rose” but not “rose”", icon: CaseSensitiveIcon },
  { option: "wholeWord", label: "Whole words", hint: "Finds “cat” but not “catch”", icon: WholeWordIcon },
  { option: "pattern", label: "Pattern", hint: "Searches with a pattern (a regular expression)", icon: RegexIcon },
]

const matchWord = (count: number) => (count === 1 ? "match" : "matches")

/**
 * Find and replace across the book (DESIGN.md §8 "Writing aids"): a search of every scene's text, its matches listed
 * by chapter and marked in the text, and replacing them one at a time or all at once.
 */
export function FindPanel({ onClose }: { onClose: () => void }) {
  const { db, bookId, plan, unit, panelDocked, closePanelTo } = useWrite()
  const { chapterId, sceneId } = useWritePlace()
  const navigate = useNavigate()
  const { query, matchCase, wholeWord, pattern, replacement, current, texts } = useFind()
  const search = searchOf({ query, matchCase, wholeWord, pattern })
  const regex = search?.regex ?? null
  const results = regex ? bookResults(plan, texts, regex) : null
  const page: FindPage = {
    bookId,
    plan,
    unit,
    chapterId,
    sceneId,
    panelDocked,
    navigate: (path) => navigate(path, { flushSync: true }),
    closePanelTo,
  }
  const options: Record<FindOption, boolean> = { matchCase, wholeWord, pattern }
  const errorId = useId()
  const findInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // The book's text is read as the panel opens, and kept up with edits while it's open.
  useEffect(() => startFindSession(db), [db])
  const sceneKey = useMemo(
    () => plan.chapters.flatMap((chapter) => chapter.scenes.map((scene) => scene.id)).join(" "),
    [plan],
  )
  useEffect(() => {
    void loadSceneTexts(sceneKey ? sceneKey.split(" ") : [])
  }, [db, sceneKey])

  // The matches are marked in the text: in the editors on the page, and in those that come onto it.
  useEffect(() => {
    showSearch(regex)
    return useEditors.subscribe((state, previous) => {
      for (const entry of state.mounted) if (!previous.mounted.includes(entry)) showSearchIn(entry)
    })
  }, [regex])

  // The list catches up with typing when it can, rather than slowing it.
  const listRegex = useDeferredValue(regex)
  const listed = useMemo(() => {
    if (!listRegex) return null
    const { matches } = bookResults(plan, texts, listRegex)
    return { groups: groupResults(plan, matches), more: matches.length > LIST_LIMIT }
  }, [plan, texts, listRegex])

  // The match the panel is on stays in sight in the list.
  useLayoutEffect(() => {
    const box = list.current
    const row = current && box?.querySelector(byData("find-result", `${current.sceneId}:${current.ordinal}`))
    if (!box || !row) return
    const outer = box.getBoundingClientRect()
    const rect = row.getBoundingClientRect()
    if (rect.top < outer.top) box.scrollTop -= outer.top - rect.top
    else if (rect.bottom > outer.bottom) box.scrollTop += rect.bottom - outer.bottom
  }, [current, listed])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isFindShortcut(event.nativeEvent)) return
    event.preventDefault()
    findInput.current?.focus()
    findInput.current?.select()
  }
  const onFindKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event.nativeEvent)) return
    event.preventDefault()
    stepMatch(page, event.shiftKey ? -1 : 1)
  }
  const onReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event.nativeEvent)) return
    event.preventDefault()
    replaceCurrent(page)
  }
  const pick = (match: BookMatch) => revealMatch(page, match, "select")

  return (
    <div data-find-panel onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-4">
        <h2 className="mr-auto text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Find and replace
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close panel"
          onClick={onClose}
          className="text-muted-foreground"
        >
          <XIcon />
        </Button>
      </header>
      <div className="grid shrink-0 gap-2.5 border-b px-4 pt-3 pb-4">
        <div className="flex items-center gap-1">
          <Input
            ref={findInput}
            type="text"
            data-find-input
            data-focus-select
            aria-label="Find"
            placeholder="Find"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={search?.error ? true : undefined}
            aria-describedby={search?.error ? errorId : undefined}
            value={query}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={onFindKeyDown}
            className="mr-1 flex-1"
          />
          <StepButton
            label="Previous match"
            keys="Shift+Enter"
            icon={ChevronUpIcon}
            disabled={!regex}
            step={() => stepMatch(page, -1)}
          />
          <StepButton
            label="Next match"
            keys="Enter"
            icon={ChevronDownIcon}
            disabled={!regex}
            step={() => stepMatch(page, 1)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {OPTIONS.map((info) => (
            <OptionToggle key={info.option} info={info} pressed={options[info.option]} />
          ))}
          <TermHint term="pattern" />
        </div>
        {search?.error && (
          <p id={errorId} className="text-sm text-destructive">
            {search.error}
          </p>
        )}
        <Input
          type="text"
          aria-label="Replace with"
          placeholder="Replace with"
          autoComplete="off"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={onReplaceKeyDown}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!regex} onClick={() => replaceCurrent(page)}>
            Replace
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!regex || !!results?.partial}
            onClick={() => void replaceAll(page)}
          >
            Replace all
          </Button>
        </div>
      </div>
      <p role="status" className="min-h-8 shrink-0 px-4 pt-2 text-xs text-muted-foreground tabular-nums">
        {results ? findStatus(results, indexOfTarget(results.matches, current)) : ""}
      </p>
      <div ref={list} data-find-results className="min-h-0 flex-1 overflow-y-auto px-2 pb-8">
        {!query && (
          <p className="px-2 text-sm text-muted-foreground">
            Searches the text of every chapter. What it finds is listed here, chapter by chapter, and marked in the text.
          </p>
        )}
        {listed?.groups.map(({ chapter, count, scenes }) => (
          <section key={chapter.id} className="pb-2">
            <h3 className="flex items-baseline gap-2 px-2 py-1 text-xs font-semibold text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">
                Chapter {chapter.number}: {chapterTitle(chapter.title)}
              </span>
              <span className="tabular-nums">
                {formatCount(count)}
                <span className="sr-only"> {matchWord(count)}</span>
              </span>
            </h3>
            {scenes.map(({ scene, index, matches }) => (
              <div key={scene.id}>
                {namesScenes(chapter) && (
                  <h4 className="truncate px-2 pt-1 text-xs text-muted-foreground">{sceneLabel(scene, index)}</h4>
                )}
                <ul className="grid gap-0.5">
                  {matches.map((match) => (
                    <ResultRow
                      key={match.ordinal}
                      match={match}
                      current={current?.sceneId === match.sceneId && current.ordinal === match.ordinal}
                      onPick={pick}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
        {listed?.more && (
          <p className="px-2 pt-1 text-xs text-muted-foreground">
            Only the first {formatCount(LIST_LIMIT)} matches are listed.
          </p>
        )}
      </div>
    </div>
  )
}

interface StepButtonProps {
  label: string
  /** The key in the search that does the same, as shortcutLabel takes it. */
  keys: string
  icon: LucideIcon
  disabled: boolean
  step: () => void
}

function StepButton({ label, keys, icon: Icon, disabled, step }: StepButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={step}
          className="shrink-0 text-ink-2"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} · {shortcutLabel(keys)}
      </TooltipContent>
    </Tooltip>
  )
}

function OptionToggle({ info, pressed }: { info: OptionInfo; pressed: boolean }) {
  const { option, label, hint, icon: Icon } = info
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          variant="outline"
          size="sm"
          pressed={pressed}
          onPressedChange={(on) => setFindOption(option, on)}
          className="text-ink-2 aria-pressed:border-primary/60 aria-pressed:bg-accent aria-pressed:text-ink"
        >
          <Icon aria-hidden="true" />
          {label}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

interface ResultRowProps {
  match: BookMatch
  current: boolean
  onPick: (match: BookMatch) => void
}

/** A match with the words around it. Picking it selects it in the text, ready to type over. */
function ResultRow({ match, current, onPick }: ResultRowProps) {
  const { before, match: found, after } = snippetOf(match.text, match.start, match.end)
  return (
    <li>
      <button
        type="button"
        data-find-result={`${match.sceneId}:${match.ordinal}`}
        aria-current={current || undefined}
        onClick={() => onPick(match)}
        className={cn(RESULT, current && "bg-accent text-ink")}
      >
        {before}
        <mark className={cn("find-match text-inherit", current && "find-match-current")}>{found}</mark>
        {after}
      </button>
    </li>
  )
}
