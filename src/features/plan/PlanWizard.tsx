import { useQuery } from "@powersync/react"
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { announce, attempt, offerUndo } from "@/app/feedback"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { setPref, usePref } from "@/db/prefs"
import { TermHint } from "@/features/help/TermHint"
import { cn } from "@/lib/utils"
import { closePlanDialog } from "./planDialogs"
import { usePlanContext } from "./planContext"
import {
  applyWizard,
  BLANK_CHAPTER_SQL,
  blankChapter,
  blankCharacter,
  newWizardDraft,
  parseWizardDraft,
  WIZARD_PARTS,
  WIZARD_STEPS,
  wizardActs,
  wizardMessage,
  wizardPlan,
  type WizardAct,
  type WizardCharacter,
  type WizardDraft,
} from "./wizard"

const draftKey = (bookId: string) => `plan.wizard:${bookId}`
const LAST_STEP = WIZARD_STEPS.length - 1

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Planning step by step (DESIGN.md §6). Picks up where the writer left off, if they closed it part way. */
export function PlanWizard() {
  const { bookId, book } = usePlanContext()
  const { value, isLoading } = usePref(draftKey(bookId))
  if (isLoading) {
    return (
      <DialogHeader>
        <DialogTitle>Plan step by step</DialogTitle>
        <DialogDescription>Opening…</DialogDescription>
      </DialogHeader>
    )
  }
  const saved = parseWizardDraft(value)
  return <WizardForm initial={saved ?? newWizardDraft(book.premise ?? "")} />
}

function WizardForm({ initial }: { initial: WizardDraft }) {
  const { db, bookId, book, plan } = usePlanContext()
  const id = useId()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const { data: blank } = useQuery<{ id: string }>(BLANK_CHAPTER_SQL, [bookId])
  const keeps = plan.chapters.length > 0 && blank.length === 0
  const step = Math.min(LAST_STEP, Math.max(0, draft.step))
  const result = wizardPlan(draft)
  const nothing =
    !result.premise &&
    !result.synopsis &&
    result.characters.length === 0 &&
    result.acts.every((act) => act.chapters.length === 0)

  // The draft is saved as the writer goes, so closing the dialog keeps it.
  const first = useRef(initial)
  const pending = useRef<string | null>(null)
  const done = useRef(false)
  const flush = useCallback(() => {
    const json = pending.current
    pending.current = null
    if (json === null || done.current) return
    void attempt("save plan draft", setPref(db, draftKey(bookId), json))
  }, [db, bookId])
  useEffect(() => {
    if (draft === first.current) return
    pending.current = JSON.stringify(draft)
    const timer = setTimeout(flush, 500)
    return () => clearTimeout(timer)
  }, [draft, flush])
  useEffect(() => flush, [flush])

  // The field to focus once the step or row it's in has rendered. At first, where the writer picks up.
  const focusNext = useRef<string | null>(step === 0 ? `${id}-premise` : `${id}-step-${step}`)
  useEffect(() => {
    if (!focusNext.current) return
    document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })
  const focusLater = useCallback((target: string) => {
    focusNext.current = target
  }, [])

  const update = (patch: Partial<WizardDraft>) => setDraft((before) => ({ ...before, ...patch }))
  const go = (next: number) => {
    update({ step: next })
    focusLater(`${id}-step-${next}`)
    announce(`Step ${next + 1} of ${WIZARD_STEPS.length}: ${WIZARD_STEPS[next]}`)
  }

  const finish = async () => {
    if (busy || nothing) return
    setBusy(true)
    const synopsisBefore = book.synopsis
    const applied = await attempt("plan step by step", applyWizard(db, bookId, result))
    setBusy(false)
    if (!applied) return
    done.current = true
    const saved = JSON.stringify(draft)
    await attempt("clear plan draft", setPref(db, draftKey(bookId), ""))
    closePlanDialog()
    // Undo brings the draft back too, so the wizard picks up where it was.
    offerUndo(db, wizardMessage(applied, result, synopsisBefore), applied.changes, () =>
      void setPref(db, draftKey(bookId), saved),
    )
  }

  return (
    <div className="grid min-h-0 gap-4" data-plan-wizard>
      <DialogHeader>
        <DialogTitle>Plan step by step</DialogTitle>
        <DialogDescription>
          Step {step + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[step]}. Every step is optional, and you can come
          back to this any time.
        </DialogDescription>
      </DialogHeader>
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Steps">
        {WIZARD_STEPS.map((title, index) => (
          <li key={title}>
            <button
              type="button"
              onClick={() => go(index)}
              aria-current={index === step ? "step" : undefined}
              className="group grid w-full gap-1.5 rounded-md py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden
                className={cn("h-1 rounded-full", index <= step ? "bg-primary" : "bg-muted group-hover:bg-ink-2/30")}
              />
              <span
                className={cn("text-xs leading-tight", index === step ? "font-medium text-ink" : "text-ink-2")}
              >
                <span aria-hidden className="sm:hidden">
                  {index + 1}
                </span>
                <span className="sr-only sm:not-sr-only">
                  {index + 1}. {title}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <PremiseStep id={id} draft={draft} update={update} />}
      {step === 1 && <PartsStep id={id} draft={draft} update={update} />}
      {step === 2 && <CharactersStep id={id} draft={draft} update={update} focusLater={focusLater} />}
      {step === 3 && (
        <ChaptersStep id={id} draft={draft} update={update} focusLater={focusLater} keeps={keeps} />
      )}

      <DialogFooter className="items-center">
        {step === LAST_STEP && nothing && (
          <p className="text-xs text-ink-2 sm:mr-auto">Fill in at least one step to have something to add.</p>
        )}
        {step > 0 && (
          <Button type="button" variant="outline" onClick={() => go(step - 1)}>
            <ArrowLeftIcon />
            Back
          </Button>
        )}
        {step < LAST_STEP ? (
          <Button type="button" onClick={() => go(step + 1)}>
            Next
            <ArrowRightIcon />
          </Button>
        ) : (
          <Button type="button" disabled={busy || nothing} onClick={() => void finish()}>
            Add to my plan
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

interface StepProps {
  id: string
  draft: WizardDraft
  update: (patch: Partial<WizardDraft>) => void
}

interface ListStepProps extends StepProps {
  /** Focuses the element with this id once it has rendered. */
  focusLater: (id: string) => void
}

/** The step's heading, which takes focus when the step opens, and what to do in it. */
function StepIntro({ id, step, children }: { id: string; step: number; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <h3 id={`${id}-step-${step}`} tabIndex={-1} className="font-heading text-base font-medium outline-none">
        {WIZARD_STEPS[step]}
      </h3>
      <div className="text-ink-2">{children}</div>
    </div>
  )
}

function PremiseStep({ id, draft, update }: StepProps) {
  return (
    <section className="grid gap-3">
      <StepIntro id={id} step={0}>
        Sum up the whole story in one sentence: who it's about, what they want, and what stands in their way. Writers
        call this the premise. It doesn't need to be perfect, and you can change it later in Book settings.
      </StepIntro>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-1">
          <Label htmlFor={`${id}-premise`}>Your story in one sentence</Label>
          <TermHint term="premise" />
        </div>
        <Textarea
          id={`${id}-premise`}
          aria-describedby={`${id}-premise-example`}
          value={draft.premise}
          onChange={(event) => update({ premise: event.target.value })}
          rows={3}
        />
        <p id={`${id}-premise-example`} className="text-xs text-ink-2">
          For example: “When her lighthouse-keeper father dies, Mara finds a ledger of ships that never existed, and
          has to learn what he was hiding before the Harbor Guild buries it for good.”
        </p>
      </div>
    </section>
  )
}

function PartsStep({ id, draft, update }: StepProps) {
  const { book } = usePlanContext()
  return (
    <section className="grid gap-3">
      <StepIntro id={id} step={1}>
        <p>
          Now grow that sentence into five: how it begins, three disasters that each make things harder, and how it
          ends. Together they make your synopsis
          <TermHint term="synopsis" className="-mr-0.5 ml-0.5 inline-flex align-text-bottom" />, and each becomes a chapter
          in the last step. A few words for each is plenty.
        </p>
        {book.synopsis?.trim() && (
          <p className="mt-1.5">
            Your book already has a synopsis, in Book settings. Writing these replaces it when you add them to your
            plan.
          </p>
        )}
      </StepIntro>
      {draft.premise.trim() && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-ink-2">Your story in a sentence: </span>
          {draft.premise.trim()}
        </p>
      )}
      {WIZARD_PARTS.map((part, index) => (
        <div key={part.title} className="grid gap-1">
          <Label htmlFor={`${id}-part-${index}`}>
            {index + 1}. {part.title}
          </Label>
          <p id={`${id}-part-${index}-question`} className="text-xs text-ink-2">
            {part.question}
          </p>
          <Textarea
            id={`${id}-part-${index}`}
            aria-describedby={`${id}-part-${index}-question`}
            value={draft.parts[index] ?? ""}
            onChange={(event) =>
              update({ parts: draft.parts.map((text, place) => (place === index ? event.target.value : text)) })
            }
            rows={2}
          />
        </div>
      ))}
    </section>
  )
}

function CharactersStep({ id, draft, update, focusLater }: ListStepProps) {
  const field = (character: WizardCharacter, part: string) => `${id}-character-${character.id}-${part}`
  const set = (characterId: string, patch: Partial<WizardCharacter>) =>
    update({
      characters: draft.characters.map((character) =>
        character.id === characterId ? { ...character, ...patch } : character,
      ),
    })
  const add = () => {
    const character = blankCharacter()
    update({ characters: [...draft.characters, character] })
    focusLater(field(character, "name"))
  }
  const remove = (index: number) => {
    const rest = draft.characters.filter((_, place) => place !== index)
    update({ characters: rest })
    const next = rest[index] ?? rest[index - 1]
    focusLater(next ? field(next, "name") : `${id}-add-character`)
  }

  return (
    <section className="grid gap-3">
      <StepIntro id={id} step={2}>
        Who matters most to the story? Give each one a name and, if you like, their part in it and what they want.
        They're added to your World, under Characters, where you can fill them in later.
      </StepIntro>
      <ol className="grid gap-2">
        {draft.characters.map((character, index) => {
          const label = `Character ${index + 1}${character.name.trim() ? ` (${character.name.trim()})` : ""}`
          return (
            <li key={character.id} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-2" data-wizard-character>
              <div className="grid gap-1">
                <Label htmlFor={field(character, "name")} className="text-xs text-ink-2">
                  Name
                </Label>
                <Input
                  id={field(character, "name")}
                  value={character.name}
                  onChange={(event) => set(character.id, { name: event.target.value })}
                  placeholder={index === 0 ? "Mara Quill" : undefined}
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={field(character, "role")} className="text-xs text-ink-2">
                  Part in the story
                </Label>
                <Input
                  id={field(character, "role")}
                  value={character.role}
                  onChange={(event) => set(character.id, { role: event.target.value })}
                  placeholder="Hero, rival, mentor…"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label htmlFor={field(character, "goal")} className="text-xs text-ink-2">
                  What they want
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={field(character, "goal")}
                    value={character.goal}
                    onChange={(event) => set(character.id, { goal: event.target.value })}
                    placeholder={index === 0 ? "To learn what her father was hiding" : undefined}
                    autoComplete="off"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label}`}
                    title="Remove"
                    onClick={() => remove(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <Button
        id={`${id}-add-character`}
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={add}
      >
        <PlusIcon />
        Add a character
      </Button>
    </section>
  )
}

function ChaptersStep({ id, draft, update, focusLater, keeps }: ListStepProps & { keeps: boolean }) {
  const { plan } = usePlanContext()
  const acts = wizardActs(draft)
  const field = (chapterId: string, part: string) => `${id}-chapter-${chapterId}-${part}`
  // The first change turns the suggested list into the writer's own.
  const change = (edit: (acts: WizardAct[]) => WizardAct[]) => update({ acts: edit(acts) })
  const setChapter = (actId: string, chapterId: string, patch: { title?: string; summary?: string }) =>
    change((list) =>
      list.map((act) =>
        act.id === actId
          ? {
              ...act,
              chapters: act.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, ...patch } : chapter)),
            }
          : act,
      ),
    )
  const addChapter = (actId: string) => {
    const chapter = blankChapter()
    change((list) => list.map((act) => (act.id === actId ? { ...act, chapters: [...act.chapters, chapter] } : act)))
    focusLater(field(chapter.id, "title"))
  }
  const removeChapter = (act: WizardAct, index: number) => {
    const rest = act.chapters.filter((_, place) => place !== index)
    change((list) => list.map((each) => (each.id === act.id ? { ...each, chapters: rest } : each)))
    const next = rest[index] ?? rest[index - 1]
    focusLater(next ? field(next.id, "title") : `${id}-add-chapter-${act.id}`)
  }

  const where = plan.hasActs ? "These go after them, in new acts." : "Your book has no acts, so these go at its end."
  return (
    <section className="grid gap-3">
      <StepIntro id={id} step={3}>
        {keeps ? (
          <>
            Your book already has {count(plan.chapters.length, "chapter", "chapters")}. {where}
          </>
        ) : (
          <>
            Here's a chapter for each of your five sentences, in three acts. Rename them, add more, or take some out.
            You can change it all later on the Plan.
          </>
        )}
      </StepIntro>
      {keeps && (
        <div className="flex items-center gap-2 pointer-coarse:min-h-11">
          <Checkbox
            id={`${id}-add-chapters`}
            checked={draft.addChapters}
            onCheckedChange={(checked) => update({ addChapters: checked === true })}
          />
          <Label htmlFor={`${id}-add-chapters`} className="font-normal">
            Add these chapters to the plan
          </Label>
        </div>
      )}
      {draft.addChapters && (
        <>
          {acts.map((act, actIndex) => (
            <section key={act.id} className="grid gap-2" aria-labelledby={`${id}-act-${act.id}`}>
              <div className="flex items-center gap-2">
                <h4 id={`${id}-act-${act.id}`} className="sr-only">
                  {act.title.trim() || `Act ${actIndex + 1}`}
                </h4>
                <Input
                  aria-label={`Act ${actIndex + 1} title`}
                  value={act.title}
                  onChange={(event) =>
                    change((list) =>
                      list.map((each) => (each.id === act.id ? { ...each, title: event.target.value } : each)),
                    )
                  }
                  placeholder={`Act ${actIndex + 1}`}
                  autoComplete="off"
                  className="font-medium"
                />
              </div>
              {act.chapters.length === 0 ? (
                <p className="pl-3 text-xs text-ink-2">No chapters in this act yet.</p>
              ) : (
                <ol className="grid gap-2 pl-3">
                  {act.chapters.map((chapter, index) => {
                    const label = chapter.title.trim() || `Chapter ${index + 1} of ${act.title.trim() || "this act"}`
                    return (
                      <li key={chapter.id} className="grid gap-1.5 rounded-lg border p-2" data-wizard-chapter>
                        <div className="flex items-center gap-2">
                          <Input
                            id={field(chapter.id, "title")}
                            aria-label="Chapter title"
                            value={chapter.title}
                            onChange={(event) => setChapter(act.id, chapter.id, { title: event.target.value })}
                            placeholder="Untitled chapter"
                            autoComplete="off"
                            className="min-w-0 flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${label}`}
                            title="Remove"
                            onClick={() => removeChapter(act, index)}
                          >
                            <XIcon />
                          </Button>
                        </div>
                        <Textarea
                          aria-label={`What happens in ${label}`}
                          value={chapter.summary}
                          onChange={(event) => setChapter(act.id, chapter.id, { summary: event.target.value })}
                          placeholder="What happens in it (optional)"
                          rows={1}
                          className="min-h-9"
                        />
                      </li>
                    )
                  })}
                </ol>
              )}
              <Button
                id={`${id}-add-chapter-${act.id}`}
                type="button"
                variant="ghost"
                size="sm"
                className="ml-3 justify-self-start"
                onClick={() => addChapter(act.id)}
              >
                <PlusIcon />
                Add a chapter to {act.title.trim() || `act ${actIndex + 1}`}
              </Button>
            </section>
          ))}
          {draft.acts !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start text-ink-2"
              onClick={() => {
                update({ acts: null })
                announce("The chapter list follows your five sentences again")
              }}
            >
              <RotateCcwIcon />
              Start the list again from your five sentences
            </Button>
          )}
        </>
      )}
    </section>
  )
}
