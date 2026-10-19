# Android IME smoke test (M0)

Phone keyboards don't type letter by letter. They **compose**: Gboard holds the word you're typing in a composing
region and keeps rewriting it until you accept it. ProseMirror's handling of composition is the riskiest part of our
editor (DESIGN.md §16, §20), and our auto-mention underlines make it riskier: they're decorations that change as you
type, and redrawing them under an active composition can double letters, drop words or leave underlines wrong.

The **IME lab** (`/lab/ime`) is a test bench for this. It's a scene editor with the real extensions, plus live checks
and an event log you can copy into a bug report.

## What desktop testing already covers

`e2e/ime.spec.ts` replays a composition in desktop Chrome through the DevTools protocol (`Input.imeSetComposition`,
then `Input.insertText`), which fires the same events a phone keyboard does. It found a real bug:

- **Guard off:** composing "Quill" after "Mara met Jonas " leaves the "Jonas Quill" underline missing for good.
  ProseMirror skips redrawing decorations that overlap the composing text, and once the highlights stop changing it
  never redraws them.
- **Guard on:** while a composition is active, highlights only move with the text. They're recomputed about 150 ms
  after it ends. Underlines stay in sync, and the e2e test locks that in.

Desktop can't reproduce keyboard-specific behavior: composing regions that start inside an existing word, autocorrect
replacing a word, swipe and voice typing, or Samsung Keyboard's quirks. That's what this phone test is for.

## Setup

The app only runs on a **secure origin** (`https://` or `localhost`). PowerSync needs the Web Locks API, which
browsers don't offer elsewhere. Opening the dev server by LAN address (`http://192.168.x.x:5173`) stops at "Your
library couldn't open". Use one of these:

### Option A: USB cable (recommended)

1. On the phone, enable USB debugging: **Settings → About phone →** tap **Build number** seven times (on Samsung it's
   under **Software information**), then turn on **Developer options → USB debugging** (under **Settings → System**
   on most phones, at the bottom of **Settings** on Samsung).
2. Connect the phone by USB and accept the "Allow USB debugging?" prompt.
3. On the computer, run `npm run dev`.
4. In desktop Chrome, open `chrome://inspect/#devices`, click **Port forwarding…**, add port `5173` →
   `localhost:5173`, tick **Enable port forwarding**, and click **Done**. Keep that tab open while you test.
   (With `adb` installed, `adb reverse tcp:5173 tcp:5173` does the same.)
5. In Chrome on the phone, open `http://localhost:5173/lab/ime`.

Bonus: `chrome://inspect` lists the phone's tab. Click **inspect** to see its console.

### Option B: Wi-Fi, no cable (Chrome only)

1. On the computer, run `npm run dev:lan` and note the **Network** URL, e.g. `http://192.168.1.207:5173`. If Windows
   asks, allow Node.js on private networks.
2. In Chrome on the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, set it to **Enabled**,
   enter the Network URL (scheme, address and port), and tap **Relaunch**.
3. Open `<Network URL>/lab/ime` on the phone.

The flag makes Chrome treat that one address as secure. Its desktop equivalent was checked: the app runs normally,
and text survives a reload.

## Using the lab

- **Toggles:** *Mention highlights*, *Composition guard* and *Smart typography* (all on by default). Changing one
  rebuilds the editor.
- **Status pills** check the editor 300 ms after each composition ends, or after plain input:
  - **Text: screen = model**: what you see matches what ProseMirror stores. **≠** means the classic IME bug (doubled
    letters, lost words).
  - **Underlines in sync**: the underlined words on screen match the highlights the editor wants. **Stale** means one
    is missing or wrong and won't fix itself.
  - **Composing / Not composing**: whether the keyboard has an active composition. While composing, underlines
    deliberately freeze; they catch up after you finish the word.
- **Event log** (newest first): keyboard, input, composition and selection events, ProseMirror transactions, and
  highlight recomputes. A red **MISMATCH** line marks the moment a check failed.
- **Copy log** copies the environment, the model text, the last check and the log, ready to paste into a report.
- **Model text** shows what ProseMirror stores. `⏎` marks a line break.
- **Clear text** and **Clear log** reset between cases.

The lab uses the sample book's codex. Names that get underlined include *Mara Quill* (aliases *Mara*, *Quill*,
*Mar*), *Jonas Quill* (*Jonas*, *Jon*), *Elias Penhallow*, *Agnes Morrow* (*Mrs. Morrow*), *Grayhaven*, and
*Grayhaven Light*.

## Test cases

Test each keyboard you can get, at least **Gboard** and **Samsung Keyboard**, in **Android Chrome** with the guard
**on**. Tap **Clear text** between cases. After each case, pause for a second, then check that:
- both pills are green,
- the text is exactly what you meant (compare it with *Model text*),
- the caret is where you left it.

| # | Do this | Expect |
|---|---|---|
| 1 | Type `Mara met Jonas Quill by Grayhaven Light.` tapping keys, accepting suggestions as you normally would | Underlines on *Mara*, *Jonas Quill*, *Grayhaven Light* |
| 2 | Type `Maraschino and Jonathan` | No underlines (names only match whole words); no doubled letters |
| 3 | Type `Jonas`, pause, then ` Quill` | The underline grows from *Jonas* to *Jonas Quill* after the pause |
| 4 | Type `Mara` and a space; backspace into the name one letter at a time, then retype it | The underline disappears and comes back; no doubled letters; the caret doesn't jump |
| 5 | Tap into the middle of an underlined name (between `Jo` and `nas`), type a letter, then delete it | **The riskiest case:** the keyboard starts composing inside the highlight. No doubled or lost letters |
| 6 | Type `Mara teh boat` and let autocorrect fix *teh* when you press space; then tap a suggestion for another word | Corrections land correctly; *Mara* stays underlined |
| 7 | Swipe-type `Mara met Jonas at the lighthouse` | Text correct; *Mara*, *Jonas* and *lighthouse* underlined |
| 8 | Voice-type with the keyboard's mic: "Mara met Jonas Quill" | Text correct; names underlined once the text is final |
| 9 | Type `Mara's coat` and `Mrs. Morrow` (try double-space for a period, too) | Underline on *Mara* only; *Mrs. Morrow* underlined as one name |
| 10 | Type `"Wait -- what..."` | Curly quotes, an em dash and an ellipsis appear once each; nothing doubled |
| 11 | Long-press to select a name, then type over it; cut and paste a name elsewhere | Text correct; underlines follow |
| 12 | Start a word, switch to another app, come back, and finish it; then rotate the phone mid-word | Text intact |

**Then turn the guard off** and repeat cases 1, 3 and 5. You should see **Underlines stale** at least once. That shows
the lab can detect the failure on your keyboard and that the guard is what prevents it. If guard-off also doubles
letters or loses words, note that too: it tells us how severe the unguarded bug is on that keyboard.

**Pass:** every case with the guard on keeps both pills green, with no doubled or lost characters and no caret jumps.

## Reporting

For each keyboard, record your phone model, Android version, Chrome version and keyboard version (**Settings → Apps →
the keyboard → App details**). Fill in a table like this:

| Keyboard | Case | Guard | Result | Notes |
|---|---|---|---|---|
| Gboard 15.x | 5 | on | pass | |

For any failure, describe what you typed and what you saw, then tap **Copy log** and paste its output with it.

## Tools above the keyboard (M8)

On a touch screen, Write puts a bar on the on-screen keyboard's top edge (DESIGN.md §16, "Built in M8").
`e2e/mobile.spec.ts` stands in for the keyboard by shrinking the visual viewport as Chrome on Android does, which
can't show how real keyboards and browsers behave. Set up as above, open `http://localhost:5173/`, then the sample
book's first chapter in Write.

Test on an Android phone in Chrome. iPhones and iPads are set aside for now (DESIGN.md §22, decision 36).

| # | Do this | Expect |
|---|---|---|
| 1 | Tap into the text | The keyboard comes up with the bar on its top edge, across the screen. The tab bar at the bottom goes |
| 2 | Tap **Bold**, type a word, then tap **Undo** and **Redo** | The word is bold. Undo takes it back and Redo puts it back. The keyboard stays up and the caret where it was, throughout: this is the case most likely to differ on an iPhone |
| 3 | Keep typing, line after line, until you're past the bar | The page scrolls so the line you're on stays just above the bar |
| 4 | Type `Wren Harrow`, then select both words | **Add to World** comes in at the start of the bar. Tapping it opens Add to World with the name filled in |
| 5 | Tap **Dictate** (set it up the first time) and say a sentence | It's typed at the caret |
| 6 | Tap **Done** | The keyboard and the bar go, and the tab bar comes back |
| 7 | Tap into the text again and rotate the phone | The bar moves to the keyboard's new top edge |
| 8 | Turn focus mode on, then tap into the text | No bar |
| 9 | Open **World** from the ⋯ menu. Drag its handle down a little and let go, then drag it most of the way down | The short drag springs back. The long one, or a flick, closes the panel |
| 10 | Android: split the screen with another app, tap into the text, then put the keyboard away with Back | The bar goes with the keyboard. **A known risk:** after the app has been used full screen, the split can look like a keyboard, leaving the bar at the foot of the app |

An iPad's floating or undocked keyboard doesn't shrink the page, so it gets no bar. The toolbar at the top still has
bold, italic, Dictate and Add to World, though not Undo and Redo.

For any failure, note the device, its system and browser versions, what you did and what you saw, with a screenshot
if you can.
