import { create } from "zustand"

/** Screen-reader announcements for things that happen without a visible message, read by Announcer.tsx. */

interface AnnouncerState {
  message: string
  /** Bumped on every announcement, so the same words are read again. */
  count: number
}

export const useAnnouncer = create<AnnouncerState>(() => ({ message: "", count: 0 }))

export function announce(message: string) {
  useAnnouncer.setState((state) => ({ message, count: state.count + 1 }))
}
