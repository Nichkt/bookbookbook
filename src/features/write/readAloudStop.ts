/*
 * Stopping read aloud (readAloud.ts) from places that don't load it, so as not to load the editor with it: a quick
 * note's Dictate, say, as the microphone would hear the reading. readAloud.ts hands over its stop as it loads; until
 * then nothing can be reading.
 */

let stop: () => boolean = () => false

export function setReadAloudStop(next: () => boolean) {
  stop = next
}

/** Stops reading aloud, if anything is; returns whether it was. */
export const stopReadingAloud = () => stop()
