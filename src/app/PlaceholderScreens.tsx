import type { ReactNode } from "react"

interface Props {
  title: string
  milestone: string
  children: ReactNode
}

// Screens that later milestones fill in. Keeps navigation real while M0 proves the storage and editor stack.
export function PlaceholderScreen({ title, milestone, children }: Props) {
  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{milestone}</p>
      <h1 className="mt-2 font-heading text-3xl font-semibold">{title}</h1>
      <div className="mt-4 space-y-3 text-ink-2">{children}</div>
    </section>
  )
}

export function PlanScreen() {
  return (
    <PlaceholderScreen title="Plan" milestone="Arrives in M1">
      <p>The Board, Outline and chapter drawer. Matrix, Timeline, Corkboard and templates follow in M5.</p>
    </PlaceholderScreen>
  )
}

export function CodexScreen() {
  return (
    <PlaceholderScreen title="Codex" milestone="Arrives in M3">
      <p>Characters, places and threads, with aliases, mentions and the Appears-in list.</p>
    </PlaceholderScreen>
  )
}

export function InboxScreen() {
  return (
    <PlaceholderScreen title="Inbox" milestone="Arrives in M11">
      <p>Quick notes and voice capture, filed into chapters later.</p>
    </PlaceholderScreen>
  )
}

export function NotFoundScreen() {
  return (
    <PlaceholderScreen title="Page not found" milestone="404">
      <p>That address doesn't match a screen. Use the tabs to get back to your book.</p>
    </PlaceholderScreen>
  )
}
