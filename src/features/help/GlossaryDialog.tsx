import { SearchIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { GLOSSARY, GLOSSARY_GROUPS, searchGlossary, termById, type GlossaryTerm } from "./glossary"
import { closeGlossary, refocus, useHelp } from "./helpStore"

const OR = new Intl.ListFormat("en", { type: "disjunction" })
const articleId = (id: string) => `glossary-${id}`

/** Focuses a term's explanation and scrolls to it. False when there's no such term showing. */
function showTerm(id: string) {
  const article = document.getElementById(articleId(id))
  if (!article) return false
  article.focus({ preventScroll: true })
  article.scrollIntoView({ block: "start" })
  return true
}

/**
 * Every word bookbookbook uses, explained in plain English (DESIGN.md §17a). The header's Glossary button opens it at
 * the top; a "?" beside a label, or a tour step, opens it at that term. It stacks above a running tour.
 */
export function GlossaryDialog() {
  const open = useHelp((state) => state.glossary !== null)
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeGlossary()
      }}
    >
      <DialogContent
        ref={contentRef}
        data-glossary=""
        overlayClassName="z-[70]"
        className="z-[70] flex h-[min(46rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          const term = useHelp.getState().glossary
          if (term && showTerm(term)) event.preventDefault()
          // Rather than the search box, which would bring up a phone's keyboard.
          else if (window.matchMedia("(pointer: coarse)").matches) {
            event.preventDefault()
            contentRef.current?.focus()
          }
        }}
        onCloseAutoFocus={(event) => refocus(event, useHelp.getState().glossaryReturn)}
      >
        <GlossaryBody />
      </DialogContent>
    </Dialog>
  )
}

function GlossaryBody() {
  const [query, setQuery] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  const searching = query.trim() !== ""
  const results = useMemo(() => (searching ? searchGlossary(query) : GLOSSARY), [searching, query])

  const seeAlso = (id: string) => {
    flushSync(() => setQuery(""))
    showTerm(id)
  }

  return (
    <>
      <DialogHeader className="gap-1 border-b p-4">
        <DialogTitle className="pr-8 text-lg">Glossary</DialogTitle>
        <DialogDescription>
          What the words in bookbookbook mean, in plain English. The examples come from The Salt Ledger, a made-up
          mystery novel.
        </DialogDescription>
        <div className="relative mt-2">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search the glossary"
            placeholder="Search, like “moment” or “beat”"
            value={query}
            className="pl-8"
            onChange={(event) => {
              setQuery(event.target.value)
              listRef.current?.scrollTo({ top: 0 })
            }}
          />
        </div>
      </DialogHeader>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 sm:px-3">
        {searching ? (
          results.length > 0 ? (
            <TermList terms={results} onSeeAlso={seeAlso} className="pt-2" />
          ) : (
            <p className="px-2 py-6 text-ink-2">Nothing in the glossary matches “{query.trim()}”.</p>
          )
        ) : (
          GLOSSARY_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`glossary-group-${group.id}`}>
              <h3
                id={`glossary-group-${group.id}`}
                className="sticky top-0 z-10 bg-popover px-2 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {group.title}
              </h3>
              <TermList terms={GLOSSARY.filter((term) => term.group === group.id)} onSeeAlso={seeAlso} />
            </section>
          ))
        )}
      </div>
      <p role="status" className="sr-only">
        {searching && (results.length === 1 ? "1 term found" : `${results.length} terms found`)}
      </p>
    </>
  )
}

function TermList({
  terms,
  onSeeAlso,
  className,
}: {
  terms: readonly GlossaryTerm[]
  onSeeAlso: (id: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      {terms.map((term) => (
        <TermArticle key={term.id} term={term} onSeeAlso={onSeeAlso} />
      ))}
    </div>
  )
}

function TermArticle({ term, onSeeAlso }: { term: GlossaryTerm; onSeeAlso: (id: string) => void }) {
  const nameId = `${articleId(term.id)}-name`
  const related = (term.related ?? []).flatMap((id) => termById.get(id) ?? [])
  return (
    <article
      id={articleId(term.id)}
      tabIndex={-1}
      aria-labelledby={nameId}
      className="scroll-mt-12 rounded-lg px-2 py-3 outline-none focus:bg-accent-soft"
    >
      <h4 id={nameId} className="font-heading text-base font-semibold text-ink">
        {term.term}
      </h4>
      {term.aka && term.aka.length > 0 && (
        <p className="text-xs text-muted-foreground">Also called {OR.format(term.aka.map((name) => `“${name}”`))}</p>
      )}
      <div className="mt-1.5 space-y-2 leading-relaxed text-ink-2">
        {term.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {term.items && (
          <ul className="list-disc space-y-1 pl-5">
            {term.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {term.example && (
          <p className="border-l-2 border-primary/40 pl-3">
            <span className="font-medium text-ink">Example: </span>
            {term.example}
          </p>
        )}
      </div>
      {related.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <span className="mr-1">See also</span>
          {related.map((other) => (
            <button
              key={other.id}
              type="button"
              className="rounded-sm px-1 font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              onClick={() => onSeeAlso(other.id)}
            >
              {other.term}
            </button>
          ))}
        </p>
      )}
    </article>
  )
}
