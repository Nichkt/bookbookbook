export interface SseEvent {
  /** The `event:` field; "message" when there was none. */
  event: string
  data: string
}

export interface SseParser {
  /** Takes the next chunk of the stream and returns the events it completed. */
  push(chunk: string): SseEvent[]
  /** Takes the end of the stream and returns what was left. */
  end(): SseEvent[]
}

/**
 * Splits a server-sent event stream into events as its chunks arrive, by the WHATWG rules: lines end in CRLF, LF or
 * CR (even a CRLF split across two chunks), a blank line ends an event, a line starting with ":" is a comment, and
 * `data:` lines join with newlines. Unlike a browser's EventSource, a last event with no blank line after it is still
 * delivered: some local servers end that way.
 */
export function createSseParser(): SseParser {
  let buffer = ""
  /** The last chunk ended in CR: a LF starting the next one ends the same line. */
  let skipLineFeed = false
  let event = ""
  let data: string[] = []
  let ready: SseEvent[] = []

  const dispatch = () => {
    if (data.length > 0) ready.push({ event: event || "message", data: data.join("\n") })
    event = ""
    data = []
  }

  const line = (text: string) => {
    if (text === "") return dispatch()
    if (text.startsWith(":")) return
    const colon = text.indexOf(":")
    const field = colon === -1 ? text : text.slice(0, colon)
    let value = colon === -1 ? "" : text.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    if (field === "event") event = value
    else if (field === "data") data.push(value)
  }

  const take = () => {
    const events = ready
    ready = []
    return events
  }

  return {
    push(chunk) {
      if (!chunk) return []
      let text = chunk
      if (skipLineFeed && text.startsWith("\n")) text = text.slice(1)
      skipLineFeed = false
      buffer += text
      let start = 0
      for (let index = 0; index < buffer.length; index++) {
        const char = buffer[index]
        if (char !== "\n" && char !== "\r") continue
        line(buffer.slice(start, index))
        if (char === "\r") {
          if (index + 1 === buffer.length) skipLineFeed = true
          else if (buffer[index + 1] === "\n") index++
        }
        start = index + 1
      }
      buffer = buffer.slice(start)
      return take()
    },
    end() {
      if (buffer) line(buffer)
      buffer = ""
      dispatch()
      return take()
    },
  }
}
