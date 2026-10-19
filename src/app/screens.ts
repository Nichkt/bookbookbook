/*
 * The book screens, each a chunk of its own (DESIGN.md §17), so that starting the app downloads only the shell and
 * the screen it opens on. The editor goes with Write; the drag and drop with the Plan.
 */
export const screens = {
  plan: () => import("@/features/plan/PlanScreen"),
  write: () => import("@/features/write/WriteScreen"),
  world: () => import("@/features/codex/CodexScreen"),
  inbox: () => import("@/features/inbox/InboxScreen"),
}

type ScreenName = keyof typeof screens

const SCREEN_PATH = /^\/b\/[^/]+\/(plan|write|world|inbox)(?:\/|$)/

/** Starts loading the screen at `pathname` alongside the shell, rather than once the router has found it. */
export function preloadScreenAt(pathname: string) {
  const name = SCREEN_PATH.exec(pathname)?.[1] as ScreenName | undefined
  if (name) screens[name]().catch(() => undefined)
}

/** Loads every screen while nothing else is going on, so moving to one doesn't wait for it. */
export function prefetchScreens() {
  for (const load of Object.values(screens)) load().catch(() => undefined)
}
