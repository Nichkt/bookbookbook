# bookbookbook

A novel planner and writing app: plan what happens in each chapter, then write chapter by chapter. The organizing side
takes after NovelCrafter, the writing side after Sudowrite.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md) covers every product and technical decision and the milestone plan.
- **Prototype:** [prototype/](prototype/README.md) is a clickable mock of the whole app. Open `prototype/index.html`.

## Download for Windows

For Windows 10 and 11, 64-bit: **[download the installer][installer]**, bookbookbook 0.1.1, about 5 MB. Newer
versions, when there are some, are on the [releases page](https://github.com/Nichkt/bookbookbook/releases/latest).
1. Your browser may say the file isn't commonly downloaded, as it's new: keep it.
2. Open it. As the installer isn't signed yet, Windows SmartScreen warns about it: click More info, then Run anyway.
3. Click Next on each page, then Finish, with Run bookbookbook ticked. It installs for you alone, so it needs no
   administrator.
4. bookbookbook opens, on "No books yet". After that, it's in the Start menu and on the desktop.

Your books stay on this computer, so keep backups, with Backups on the home screen. Installing a newer version over
this one keeps them, and so does uninstalling, in Settings → Apps, unless you tick Delete the application data. To
build the app yourself, see [The Windows app](#the-windows-app).

[installer]: https://github.com/Nichkt/bookbookbook/releases/download/v0.1.1/bookbookbook_0.1.1_x64-setup.exe

## Status: home, Plan, World, Write, writing aids, AI, Inbox, dictation, search, help, import, export, backups, offline, Windows app

Milestones 0 to 8 and 11 from DESIGN.md §19 are built, and M12's Windows app, plus a home screen, a glossary and a
tour of every page. M8 still wants tests on real Android phones and a pass with screen readers, which take a person.
Macs, iPhones and iPads are set aside for now.
Everything stays on the device, except what an AI tool reads when you run it, which goes only to the AI you chose, and
your voice when you dictate online, which goes to the browser's maker (Microsoft's, in the Windows app).
There are no accounts or sync yet, so keep backups: Backups… in the book menu downloads one, or backs every book up to
a folder as it changes (Chrome, Edge and the Windows app).

**After M12, adding a chapter** (DESIGN.md §6, "Built after M12"):
- **Add a chapter:** a big button after the last chapter of each act on the Board, or of the book when it has no
  acts, pops out a new chapter to fill in. The toolbar's Chapter button does the same at the end of the book. In the
  Outline and on the Corkboard, Add a chapter puts a line or an index card at the end of the act, to title in place.
- **Save or go back:** a bar along the bottom of the pop-out has Back to planning and Write this chapter, and Save
  for a new chapter. Save puts the chapter in your plan and takes you back to it, and Write this chapter keeps it
  too. Going back any other way (Back to planning, the X or Esc) leaves a new chapter out: a blank one is simply
  gone, and one you've typed in goes to the Trash, with Undo.

**M12, The Windows app** (DESIGN.md §11, "Built in M12"; see [The Windows app](#the-windows-app)):
- **An app of its own:** an [installer](#download-for-windows) for Windows 10 and 11 puts bookbookbook in the Start
  menu and on the desktop, for you alone, with no administrator needed. It opens in its own window, where and as large
  as it was when last closed, works without the internet, and starts with no books.
- **One window:** opening it again brings the open window to the front. Links out of the app, like Get a key, open in
  your browser.
- **Your books stay on the computer**, apart from any in bookbookbook in a browser; a backup takes a book from one to
  the other. Uninstalling keeps them, unless you tick Delete the application data.
- **Folder backups keep going:** the folder you chose stays allowed from one day to the next, without asking, and
  minimizing or closing the app backs up what changed, closing waiting a moment for it.
- **Dictation and read aloud** use Microsoft's online speech service and the voices Windows has. The microphone needs
  only Windows' own permission.
- **It says "this computer"**, not "this browser", wherever that's what it means: Backups, dictation, AI settings,
  the glossary and the home tour.

**M8, Offline and installing** (DESIGN.md §11, "Built in M8"):
- **Works offline:** once bookbookbook has opened, it opens without an internet connection, at any of its pages.
- **Install it** for a window and an icon of its own. The home screen offers to, in Chrome and Edge, and gives
  Safari's steps on an iPhone, iPad or Mac, where Safari can clear a website's data after a week without a visit,
  though not an installed app's. Not now puts the offer away; Search's "Install bookbookbook" stays.
- **Updates wait for you:** a new version downloads in the background, then a message offers **Reload**, which saves
  your writing first and moves every open tab to it, or **Later**, and it starts the next time you open bookbookbook.
- Only a build does this: see [Trying it offline](#trying-it-offline).

**M8, Search** (DESIGN.md §4, "Built in M8"):
- **Search**, at the top of every page, or **Ctrl+K** (⌘K on a Mac) from anywhere, finds a chapter (by its title or
  "chapter 3"), a scene, a World entry (by any of its names), a page, a Plan view, another book or a glossary term.
  Pick one and you're there: a chapter pops out on the Plan, and an entry opens beside the text on Write.
- **It does things too:** type what you want, "focus mode", "dark theme", "export", "brainstorm", and press Enter.
  Everything in the page's toolbars and menus is there, with its shortcut beside it, so you can learn them as you go.
- **Back where you were:** what you pick runs with the cursor where you left it, and Esc closes Search having done
  nothing.

**M8, Phones and tablets** (DESIGN.md §16, "Built in M8"):
- **Tools above the keyboard:** while you type on a phone or tablet, a bar on top of the on-screen keyboard has Undo,
  Redo, Bold, Italic and Dictate, and Done puts the keyboard away. Select a name your World doesn't have and **Add to
  World** joins them. As you type, the cursor stays above the bar, and messages rise above it too.
- **Panels from the bottom:** on a phone, Write's panel (Chapter details, World, Find and replace, AI tools) rises
  from the bottom. Drag its handle down, or flick it, to close it.
- **Not yet tried on a real phone:** the tests stand in for the keyboard. See [Phone keyboards](#phone-keyboards)
  for what to check on one.

**M8, Accessibility** (DESIGN.md §17, "Built in M8"):
- **Checked page by page:** every page, panel, menu and dialog is checked with axe against WCAG 2.2 AA, in the
  light, sepia and dark themes, on a computer and on a phone.
- **What changed:** gray text is darker (lighter in the dark theme) so it's easier to read, text on an entry's
  color is black or white, whichever stands out more, and what a screen reader calls a button or link now starts
  with the words on it.

**M8, Long books** (DESIGN.md §17, "Built in M8: performance"):
- **Quick with a whole novel in it:** with 160,000 words, typing shows at once, a chapter opens in under a tenth of a
  second, and the Manuscript, the whole book on one page, scrolls smoothly, as dragging cards on the Board does.
- **Starts sooner:** each page downloads when it's first needed, or in the background once the app is open, so
  opening bookbookbook downloads about 40% less.
- **Measure it yourself:** `npm run perf` times all this against the design's budgets. See [Performance](#performance).

**M11, Inbox and dictation** (DESIGN.md §10, "Built in M11"):
- **Inbox:** the Inbox tab catches ideas as they come, typed or dictated, to sort into the book later. **File…** adds
  a note to a chapter's notes, moments or summary, or to a World entry's notes, and **Add to World** makes it an
  entry. Filed notes say where they went, with a link there. Filing, Move back and Delete each have Undo.
- **Quick note:** the header's Quick note button, on every page of a book, catches an idea without leaving the page.
  Close it unsaved and the note is still there when you come back, until the page reloads.
- **Dictation:** Dictate, in the Inbox, Quick note and Write's toolbar (focus mode and phones too), types what you
  say. The first time, choose the language you'll speak and where speech becomes text: on this device, private and
  offline (Chrome 139 or later, perhaps after a one-time download), or online with the browser's maker (Google in
  Chrome, Microsoft in Edge, Apple in Safari). Firefox can't yet, but a phone keyboard's microphone works anywhere.
- **Into the text:** in Write, it types at the cursor as if you'd typed it, and Undo takes it back. **Ctrl+Shift+M**
  (⌘⇧M on a Mac) starts and stops it. Dictation and Read aloud stop each other.
- **Voice commands** (English): "period", "comma", "new paragraph", "open quote" and the like, "scratch that" to
  take back what you said last, and "stop listening". The glossary's Voice commands lists them all.
- **Not yet:** voice memos, speech models that run in the page (for dictating on the device outside Chrome), cloud
  transcription, AI clean-up of what you said, and dictating into a chapter's or entry's fields.

**M4, AI tools** (DESIGN.md §9, "Built in M4"):
- **Set up:** AI tools, in Write's toolbar (the ⋯ menu on phones), starts with Set up AI. Choose where the AI runs, a
  model on this computer (Ollama or LM Studio, free and private) or your own OpenAI, Anthropic or OpenRouter key, and
  the model to use. See [Setting up the AI tools](#setting-up-the-ai-tools).
- **Ctrl+J** (⌘J on a Mac) opens AI tools and continues from your cursor: two versions to insert or copy, while you
  read on or keep writing.
- **Tools:** Continue (told what should happen, if you like), Draft from moments, Describe (the five senses and a
  metaphor), Rewrite, Expand, Condense, Dialogue polish, Brainstorm, Name generator, Summarize chapter and Chapter
  feedback. Ideas can become moments, World entries or the chapter's title, and a summary the chapter's.
- **Your own tools:** write what to ask the AI, with buttons that put in your selection, the text around it, the
  chapter's plan, World and your style, and choose what comes back: two versions, a list of ideas or a draft.
- **What the AI sees:** each part a run would send with its size, which you can untick, and the whole prompt word for
  word. When there's too much, the least needed parts go first, and the result says so.
- **Results** come as cards, as the AI writes them, with Stop, Run again, Insert or Replace, and Copy. Each book keeps
  its newest 100, and Clear all has Undo.
- **AI-written text** has a faint tint (AI settings can hide it); what you type into it is yours. The panel shows how
  much of the chapter and the book the AI wrote, and Today and your goals count only your own words.
- **Book style:** Book settings has a part for the AI tools: point of view, tense, who the book is for, a style guide
  and sample passages of your writing.
- **Not yet:** hosted AI without a key of your own (it waits for accounts, M10), AI from the selection bubble or a
  right-click menu, cost estimates, and keys encrypted on the device. (Search runs any AI tool since M8.)

**M6, Writing aids** (DESIGN.md §8, "Built in M6"):
- **Focus mode:** Ctrl+. (⌘. on a Mac), or the toolbar's Focus mode button, clears away everything but your text
  and fades the paragraphs you aren't writing. Esc brings it all back.
- **Typewriter scrolling:** keeps the line you're writing halfway down the window. Turn it on in the ⋯ menu.
- **Goals and sprints:** click Today in the toolbar to set a daily goal for the book, see your streak of days that
  met it (or hide it), and start a sprint: 15, 25, 45 minutes or your own length, with a countdown and the words you
  wrote at the end. A sprint carries on through a reload.
- **Find and replace:** Find in the toolbar, or Ctrl+Shift+F with words selected, searches the whole book as you
  type, listing matches by chapter. Enter and Shift+Enter go from match to match. Match case, Whole words and Pattern
  (regular expressions) narrow it. Replace changes one match, and Replace all changes the whole book, saving a
  version of each scene first, with Undo.
- **Add to World:** select a name in your text that isn't in World yet and click Add to World over it, or use the ⋯
  menu. Pick its type and other names, and the text underlines it from then on.
- **Read aloud:** the ⋯ menu reads your text back in your device's voices, a sentence at a time, from the cursor or
  just the selection. Pause, skip, and change the voice and speed as it reads; Esc stops it with your cursor on the
  sentence it reached.
- **Not yet:** comments, a read-through mode, prose checks, grammar checks and @-mentions.

**M5, Planner II** (DESIGN.md §6, "Built in M5"):
- **Matrix:** who and what is in each chapter. Click a character's cell to mark them present or the point of view,
  and a story point's cell to put it in the chapter. A story point away for 3 chapters or more is flagged, so
  readers don't forget it. The arrow keys move around the grid.
- **Timeline:** chapters in the order they happen in the story, a lane per point-of-view character, with flashbacks
  set apart and World events alongside; or in reading order, with each jump back in time marked. Set a chapter's
  story time in its pop-out.
- **Corkboard:** index cards to write each chapter's title and summary on, moved by dragging or Alt+arrow keys.
- **Story structures:** choose one from the Plan's Structure menu (Three-act, 15-beat, Hero's journey, Story circle,
  Seven-point, Romance beats, Kishōtenketsu or your own). A ribbon above the Board and Corkboard shows where each
  structure moment should fall and which chapter is marked as it; click one to mark a chapter. Its Hide button tucks
  it away, and the menu brings it back.
- **Your structures:** make your own, from nothing or a copy, in Your structures… in the Structure menu. Save one
  as a file to share, and add one from a file.
- **New book, Start with:** one blank chapter, a structure (a chapter for each of its moments, the word count target
  shared between them), or planning step by step.
- **Plan step by step:** your story in a sentence, then in five, then its main characters, then a chapter list
  grown from the five sentences. Adding it fills in the premise and synopsis (in Book settings), puts the characters
  in World and the chapters in the Plan, and one Undo takes it all back. Close it to finish later.
- **Undo works over dialogs:** a toast's Undo can be clicked, or reached with Alt+T, without closing the dialog.

**After M7, home, chapter pop-out, World and help** (DESIGN.md §4, §6, §7, §17a):
- **Home screen:** the app opens on your books, the last opened first, each with its words against its word count
  target. A book reopens on the screen you left it on. New book, Import, Restore, Backups and the Trash are there
  too. The bookbookbook logo, or All books in the book menu, comes back to it.
- **Chapter pop-out:** click a chapter on the Board, or its ⤢ button in the Outline, and everything planned for it
  pops out over the Plan (the whole screen on phones). Previous and Next chapter step through the book, and **Write
  this chapter** opens it in Write.
- **Plain labels:** Word count target, Point of view, What characters are present, Moments (beats), Story points
  (plot threads) and Structure moment.
- **World:** the Codex is now called World throughout the app. Old `/codex/` links still work.
- **Glossary:** the header's Glossary button explains every term in plain English, with examples from *The Salt
  Ledger*, a made-up mystery novel. Search finds the trade's words too ("beat", "POV", "codex"). The "?" beside each
  of a chapter's fields opens its entry.
- **How to use this:** a click-through tour of the page you're on (Home, Plan, Write, World or the Inbox) that lights
  up each part in turn. ← and → step through it, and Escape ends it. Phones have both in a Help menu.

**M3, World (the codex)** (DESIGN.md §7):
- **World screen:** the types, their entries and an entry side by side on wide screens, one at a time on phones.
  Search looks through every type's names, aliases, tags, fields and notes, and a tag filter narrows it.
- **Entries:** name, color, type, tags, aliases, AI context, details and notes, saved as you type. Add a field to
  one entry, or to every entry of its type.
- **Appears in:** the chapters that mention an entry or link it in the plan, with its role there and how often it's
  mentioned. Each opens its chapter in Write.
- **Custom types:** add, rename and delete your own, beside the eight built in.
- **Trash:** entries go to the Trash with Undo, and come back from the book menu.
- **Hover cards:** rest the mouse on an underlined name in the text to see its entry; Ctrl+click (⌘-click on a Mac)
  opens it in World.
- **World panel:** beside the text in Write, from the toolbar's World button (the ⋯ menu on phones). It lists the
  chapter's characters, places and story points first, with their roles and mentions, then every entry, and shows
  one at a time to read.

**M7, Import, export and backups** (DESIGN.md §13):
- **Import** a Word document, Markdown or plain text, or paste a manuscript, from the book menu or the empty library.
  A preview shows the chapters, acts and scenes it found. Change where chapters start, rename, merge, start acts or
  leave chapters out, with Undo, then import it as a new book.
- **Export** from the book menu:
  - a Word manuscript in standard manuscript format: a title page with the word count, a running head, Times or
    Courier, Letter or A4;
  - Markdown or plain text, as one file or a file per chapter.

  Chapters are headed by number, title or both, and each book remembers its choices.
- **Backups:** one zip with the whole book (plan, World, prose, named versions and writing stats), and a Markdown
  copy to read without the app. Back up now from Backups… in the book menu, or choose Backup in Export….
- **Folder backups:** choose a folder in Backups…, ideally one a cloud drive syncs, and every book is backed up there
  within the hour of a change and as you leave the app. The newest 10 backups of each book are kept. Chrome and Edge
  on computers.
- **Backup reminder:** a book that has gone a week of changes without a backup says so as it opens, or when you come
  back to the tab, never mid-sentence. So do folder backups that need your permission again or have lost their
  folder. The book menu shows when the open book was last backed up.
- **Restore** a backup from the book menu or the empty library. It comes back as a new book, beside the others.

**M2, Editor core** (DESIGN.md §8):
- **Three views:** Scene shows one scene at a time and pages through the book across chapters. Chapter shows a
  chapter's scenes one after another. Manuscript is the whole book on one page, and the address follows the chapter
  you're reading. Each book remembers its view.
- **Formatting:** bold, italic, block quote, centred lines and scene breaks, from the toolbar or the keyboard. Quotes,
  dashes and ellipses turn typographic as you type.
- **Scenes:** name, add, reorder or trash them from each scene's header. A chapter is one unnamed scene until you add
  another.
- **Navigator:** chapters under their acts with their status and word counts, the open chapter's scenes, and the
  book's progress toward its target.
- **Word counts** for scenes, chapters (against their targets) and the book. **Today**, in the toolbar, counts the
  words you've written in the book today.
- **History:** every scene keeps versions, automatic ones as you write and named snapshots (Ctrl+Alt+S). Compare one
  with the scene now, restore it, and undo the restore.
- **Chapter plan:** the chapter's details from the planner, beside the text on wide screens (1280 px and up) and in
  a sheet on smaller ones.
- **Phone:** a chapter picker, bold and italic in the toolbar, and a ⋯ menu with the rest.

**M1, Structure & Planner I** (DESIGN.md §6):
- **Books:** create, switch and edit them (title, author, genre, word count target) from the header's book menu,
  which also holds the Trash and All books.
- **Board:** acts as rows of chapter cards. Drag cards within and between acts, or move them with Alt+arrow keys.
  Display presets (Compact, Standard, Detailed) with per-field toggles, remembered per view. Filters by point of
  view, status and story point.
- **Outline:** acts, chapters, scenes and moments in one keyboard-first tree. Enter adds an item. Tab folds one into
  the item above and Shift+Tab splits it off, both with Undo. Alt+↑/↓ moves.
- **Chapter details:** status, point of view, word count target, location, story time, story points, what characters
  are present, labels, summary, moments, scenes and notes, saved as you type. Pickers can create World entries. Built
  as a drawer; it now pops out (see above).
- **Trash:** chapters, scenes and books stay for 30 days. Undo right away, or restore from the book menu.
- **Write:** the navigator lists chapters under their acts, and each chapter links to its details in Plan.
- **Touch:** every control is at least 44 px on touch screens, and the Board stacks into one column on phones.

**M0, foundations:**
- **Local-only database:** PowerSync's SQLite in the browser, with the full schema.
- **Scene editor:** TipTap on a Yjs document per scene. Edits are saved as you type, and open tabs show the same text.
- **World name underlines** that hold still while a phone keyboard is mid-word (see [Phone keyboards](#phone-keyboards)).
- **Themes:** light, sepia and dark, built on design tokens (DESIGN.md §15).

A real install starts with no books. Only the dev server and the end-to-end tests fill an empty library with the
sample book, *The Salt Ledger*: a made-up mystery in twelve chapters, the first four written. `npm run build` leaves
it out.

## Requirements

- Node.js 22.13 or newer (developed on 24). The unit tests use `node:sqlite`, which needs no flag from 22.13.
- Google Chrome, for the end-to-end tests.
- A **secure origin**: `localhost` or `https://`. PowerSync needs the Web Locks API, which browsers only offer on
  secure origins. A LAN address like `http://192.168.1.20:5173` stops at "Your library couldn't open". To test on a
  phone, see [docs/ime-smoke-test.md](docs/ime-smoke-test.md#setup).

## Getting started

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. The app starts on your books; new to it? Press **How to use this** in the header on
any page for a tour, or **Glossary** for what the words mean. The dev server fills an empty library with the sample
book; to start over with a fresh one, clear the site's data (DevTools → Application → Storage → Clear site data) and
reload.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at <http://localhost:5173> |
| `npm run dev:lan` | The same, reachable from other devices on your network (phone testing) |
| `npm run build` | Type-checks, then builds to `dist/` |
| `npm run preview` | Serves the build at <http://localhost:4173>, which starts with no books, as a real install does |
| `npm run typecheck` | `tsc -b` over the app, tests and configs |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run perf` | Times the app with a book of 161,741 words, against the performance budgets |
| `npm run icons` | Draws the app's icons in `public/` from `public/favicon.svg`, in Chrome |

### Trying it offline

The dev server has no service worker, so working offline and installing only happen in a build:

```sh
npm run build
npm run preview
```

Open <http://localhost:4173> and wait for "Ready to work offline". Then it opens with no connection (try DevTools →
Network → Offline, and reload), and Chrome offers to install it, above your books and in the address bar. Its books
are kept apart from the dev server's, as it's another address. To see an update arrive, change something and build
again with it open: the browser finds the new version when a page next opens, or within the hour. To be rid of the
service worker, clear the site's data.

## The Windows app

`src-tauri/` puts the same app in a window of its own with [Tauri 2](https://v2.tauri.app), drawn by WebView2, the
browser engine that comes with Windows. It's built for Windows alone (DESIGN.md §22, decision 36). Besides Node.js,
building it needs:
- Rust 1.90 or newer, from [rustup](https://rustup.rs);
- Microsoft's C++ build tools: [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
  with "Desktop development with C++".

| Command | What it does |
|---|---|
| `npm run tauri dev` | The app in its window, on a dev server of its own at <http://localhost:1420> (`npm run dev:desktop`), reloading as you change it |
| `npm run tauri build` | Builds the app (`npm run build:desktop`, to `dist-desktop/`), then its installer: `src-tauri/target/release/bundle/nsis/bookbookbook_<version>_x64-setup.exe` |

The first build compiles Tauri, which takes several minutes; after that, about one.

- **Installing:** the installer puts bookbookbook in `%LOCALAPPDATA%\bookbookbook`, with a Start menu shortcut, for
  the user running it, so no administrator is needed. Its last page has Run bookbookbook and Create desktop shortcut,
  both ticked. `/S` installs it silently, with the desktop shortcut unless `/NS` is added, and `/R` opens it after.
  It isn't signed yet, so Windows SmartScreen warns about it: More info, then Run anyway. If WebView2 is missing, as
  it can be on Windows 10, the installer fetches it.
- **Its books** are WebView2's, in `%LOCALAPPDATA%\io.github.nichkt.bookbookbook`, apart from any in a browser. So the
  identifier in `src-tauri/tauri.conf.json` must never change, or the app would open on an empty library. The
  window's place and size are kept in `%APPDATA%\io.github.nichkt.bookbookbook`. A real install starts with no books;
  `npm run tauri dev` has the sample book, as the dev server does, and keeps it apart, as it's another address.
- **Uninstalling** (Settings → Apps, or `uninstall.exe`, `/S` for silently) keeps the books, unless Delete the
  application data is ticked.
- **Releasing:** raise `version` in `package.json`, which the app and its installer take theirs from, and run
  `npm run tauri build`. Then `gh release create v<version> <the installer>` makes a release on GitHub with the
  installer attached, and the link in [Download for Windows](#download-for-windows) wants changing to it, as the
  installer's name has the version in it.
- **What the desktop build changes** (`src/app/desktop.ts`, true in Vite's `desktop` mode): no service worker or
  offers to install; PowerSync without the shared worker that lets tabs share the database, which WebView2 keeps past
  a reload, so the reload never finished opening the library; and the wording, which says "this computer". There's one
  window: opening the app again brings it to the front. Links out of the app open in the browser.
- **Permissions:** WebView2 would ask for the microphone and the backup folder in prompts of its own, with a Block
  that the window has no settings to undo, so the app (`src-tauri/src/lib.rs`) allows them itself. Windows' own
  microphone privacy setting still applies. WebView2 forgets the folder's permission whenever the app closes, and
  gives it back only at a click or key press, so the app asks again, silently, at the writer's first one. Until then,
  backups show as on.
- **Leaving:** minimizing tells the page it's hidden, which WebView2 doesn't do by itself, so a backup runs. Closing
  the window waits for a last backup, ten seconds at most; closing it again closes it at once.
- **Dictation** is online only, on Microsoft's speech service: WebView2 can't recognize speech on the computer yet.
- **Ollama** answers only `localhost` pages as it comes, so it needs `OLLAMA_ORIGINS=http://tauri.localhost`, as AI
  settings says.
- **Not yet:** the OS keychain for AI keys, backups written by the app rather than WebView2, updates (install a new
  version over the old one; the books stay) and a signed installer.

To look into the built app with DevTools or Playwright, start it with the environment variable
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` and connect to that port. While it's connected,
Playwright keeps the page "visible" even with the window minimized (its focus emulation), so disconnect it to test
leaving.

## Setting up the AI tools

The AI tools need a model to talk to: one on your computer, free and private, or an AI company's, with your own key.
Open a chapter in Write, then AI tools → Set up AI.
- **Ollama:** install it from <https://ollama.com>, get a model (`ollama pull llama3.1`, or any chat model) and leave
  Ollama running. Choose On this computer, then Ollama, Check connection and the model. It answers pages on
  `localhost` as it is; served from any other address, the app needs Ollama started with `OLLAMA_ORIGINS` set to
  that address, as AI settings shows. Ollama reads 4k tokens at a time on most computers, so to let it read more,
  start it with `OLLAMA_CONTEXT_LENGTH` set (say to `16384`) and set How much it can read to match.
  [Ollama's FAQ](https://docs.ollama.com/faq) shows how to set these.
- **LM Studio:** load a model, start its local server with "Enable CORS" turned on, then choose On this computer and
  LM Studio.
- **Your own key:** choose OpenAI, Anthropic or OpenRouter, follow Get a key and paste it in. You pay the company for
  what you use. The key stays on this device, out of backups, and goes only to its own company. It isn't encrypted
  yet, so give it a spending limit.

The end-to-end tests fake the model's API, so they need none of this.

## Tests

**Unit tests** live next to the code (`src/**/*.test.ts`) and run in Node. Tests that write to the database use an
in-memory SQLite with the app's schema (`node:sqlite`; helpers in `src/test/`). They cover:
- scene saving and compaction (`SceneDocProvider` against an in-memory store);
- the mention highlighter, codex name matching, word counts, number entry in any locale and the Yjs helpers;
- the plan's edits (create, move, fold, split, trash) and their exact undo;
- ordering keys, story time, the Board's drop targets and the Outline's keyboard paths;
- books, codex entries, the sample book (and the builds that leave it out) and the Trash;
- World (the codex): entries and types (fields, aliases, trash and their exact undo), search, the screen's layout
  and list rules, Appears in, and the World panel's chapter list (its order, roles and counts);
- word counts and the day's writing stats, scene versions (saving, pruning, restoring) and how History compares them;
- the Scene view's reading order, and shortcut labels and keys;
- export: the manuscript and its chapter headings, Word, Markdown (both ways) and plain-text files, safe file names,
  backups and restoring them, and the Export dialog's saved choices;
- backup status: when a book counts as changed, the reminder's rules and labels, and folder backups (file names,
  replacing only their own files, keeping 10, a failed or missing folder, a backup gone from it);
- import: reading Word documents (styles, marks, tracked changes, limits), Markdown and plain text (encodings and
  paragraphs), splitting into acts, chapters and scenes, the title and author, the preview's edits and Undo, and the
  book it writes;
- the home screen's order, links and "Opened …" labels, and the visits it remembers;
- colors: the contrast between two, and black or white text, whichever reads better, on any color;
- installing: which devices and browsers are given Safari's steps to add the app;
- the Windows app: the folder's permission asked for again at the first click or key press, backups shown as on
  until then and as paused if it fails, closing waiting for a last backup, and dictation's messages for Windows;
- the on-screen keyboard: finding its top edge from the visual viewport, whether or not it shrinks the window too,
  as the page scrolls under it, and not mistaking the browser's own bars or a pinch for one;
- writing aids: find and replace (searching a paragraph at a time, whole words, patterns and their replacements,
  the panel's list and counts, where Next goes), its marks in the text, read aloud's sentences and its mark, goals,
  streaks and sprints, the day's words, and which selections Add to World takes for a name;
- the Matrix (marks, mentions and quiet story points), the Timeline (story and reading order, flashbacks, time
  jumps), story structures (placing moments, stacking the ribbon's pins, a new book's chapters, files), saving your
  own structures and planning step by step, with their exact undo;
- AI tools: settings and providers, streamed answers (Server-Sent Events, errors, stopping), what a run sends and how
  it's trimmed to fit, what it gathers from the book, the tools and your own, reading answers, cards and runs,
  inserting and replacing text, the AI mark, AI-written word counts and the book's style;
- dictation: voice commands and how dictated words are spaced and capitalized, a dictation session (starting again
  after silences, stopping, failures), the engine and on-device checks, and typing into the text and "scratch that";
- the Inbox: notes, filing into chapters and World entries and its exact undo, what a filed note says, and naming a
  World entry from a note;
- help: every glossary term's links and search (old names and word order included), every tour step's copy on touch
  and narrow screens and in each Plan view, and where a tour card goes beside, over or without what it points at;
- Search: how what's typed ranks commands (labels over keywords, a word's start over letters inside it, glossary
  terms a step lower, sections by their best match), and a page's commands taking the place of the app's.

**End-to-end tests** (`e2e/`) run in your installed Chrome against a dev server on port 5174, which Playwright starts
(or reuses if it's already running). The offline tests need a build instead: `e2e/preview.ts` builds one afresh, in
the `e2e` mode that keeps the sample book, to `dist-e2e/`, and serves it on port 4174. Every test gets a fresh
browser profile, so each one starts from the sample book.
They cover:
- startup;
- typing and reloading;
- compaction;
- two tabs converging;
- the theme setting, and the title bar's color in each theme;
- the phone layout;
- a phone-style keyboard composition, replayed through the Chrome DevTools Protocol;
- the planner (`plan.spec.ts`): dragging and keyboard moves on the Board, display presets, filters, the chapter
  pop-out (its fields, Previous and Next, Write this chapter, deleting a moment and Undo) and its URL, the Trash,
  adding a chapter (Add a chapter on the Board, in the Outline and in a book without acts, then Save, Back to
  planning, Esc and Undo, or Write this chapter), folding and splitting in the Outline, and the links between Plan
  and Write;
- the planner's other views and structures (`plan-views.spec.ts`): the Matrix's cells, quiet story points and keys,
  both Timeline orders and a story time changed, writing on and moving Corkboard cards, the structure ribbon and
  Structure menu, a new book from a structure, planning step by step (and its Undo) in a new book and the sample,
  and Your structures: a copy, its file, adding one from a file, deleting with Undo, and focus throughout;
- the Write screen (`write.spec.ts`): the three views and their addresses, a jump holding still while the
  Manuscript settles, which scene the toolbar acts on, formatting, naming, adding and trashing scenes, History, Today
  and the chapter plan;
- writing aids (`writing-aids.spec.ts`): Add to World from the bubble and the ⋯ menus (names World has, phones),
  read aloud (from the cursor or a selection, speed and voice, where it stops, phones), focus mode, typewriter
  scrolling, goals and sprints (a sprint through a reload, phones), and find and replace (the whole book, Replace,
  Replace all with its versions and Undo, patterns, Ctrl+Shift+F, narrow screens, and keys pressed quickly);
- AI tools (`ai.spec.ts`), the model's API faked in the browser: setting up a model on this computer and Ctrl+J (the
  tint, the AI's share and the day's words), Rewrite with Replace and Undo, Stop, Run again and Clear all, a key
  turned away and then put right, What the AI sees, Brainstorm's moments and World entries, Summarize chapter, a tool
  of your own, the book's style in the prompt, and a phone;
- the Inbox and dictation (`inbox.spec.ts`), the browser's speech recognition faked: filing a note as moments, into
  a chapter's notes and an entry's, with Undo and links there; a note made into a World entry; Move back and Delete
  with Undo, down to an empty Inbox; Quick note from Write; setting dictation up and dictating a note; dictating into
  the text at the cursor, with its commands, Ctrl+Shift+M and Read aloud; and Write's phone bars;
- export (`export.spec.ts`): a Word manuscript with the last words typed and the author, Markdown as one file and a
  file per chapter, a backup restored beside its original, a file that isn't a backup, nothing to export, and
  restoring into an empty library;
- backups (`backups.spec.ts`): the reminder for a book unbacked-up through a week of changes, Back up now, Not now,
  a reminder falling due mid-session that waits for the writer to come back, one falling due while they're away
  that's there when they're back (in a browser without folder backups), and folder backups to a stand-in folder:
  choosing one, keeping it up to date, stopping, permission taken back, a deleted folder, and the reminder keeping
  focus while its folder backup runs, or as its focused button goes;
- import (`import.spec.ts`): a Markdown manuscript with acts and scenes, a paste reworked in the preview (leaving
  out, starting an act, merging, Undo, Enter between titles), a Word document with its title, author and italics,
  files it can't read, and a file dropped into the empty library;
- World (`codex.spec.ts`): a new entry surviving a reload, Appears in and back, the Trash and Undo, custom types,
  a field on every character, search with the tag filter, a new character found in the text and counted, and the
  phone layout;
- World in Write (`codexPanel.spec.ts`): the panel's chapter list, entries, search and focus, Back to the row an
  entry was opened from and the list where it was left, counts that follow the text, sharing the panel with the
  chapter plan, hover cards that leave the caret alone, and Ctrl+click;
- the home screen (`home.spec.ts`): reopening a book where it was left, a new book listed first, Backups from home,
  and a page that doesn't exist;
- help (`help.spec.ts`): glossary search by old names, See also, the "?" beside a field, every page's tour walked to
  Done, the Plan tour opening a chapter's pop-out and closing it, a term explained mid-tour, the home tour in an empty
  library, and leaving the page;
- Search (`palette.spec.ts`): Ctrl+K over the text and back with the cursor where it was, opening it again as it
  fades away, a chapter and an entry on Write, the Plan's pop-out, views and a scene, an entry on World and Back,
  focus mode, a theme and Book settings, Ctrl+K left to the glossary, an AI tool picked and Continue run, a book and
  a term from the home screen, and a phone;
- offline and installing (`pwa.spec.ts`, on the build): opening offline at every page once opened, with the
  browser's cache cleared; Chrome's install checks, the manifest and the icons; a new version waiting through Later
  and a reload, then Reload keeping the last words typed; and Reload moving every open tab to it. Each test gets a
  new version of its own, through a cookie the server looks for, so they run side by side;
- installing (`install.spec.ts`), the browser's offer faked: Install on the home screen, accepted or dismissed, Not
  now remembered, Safari's steps on an iPhone and a Mac and Search taking them to the glossary, Install in the
  Backups dialog when the browser won't keep the books, and nothing offered once installed;
- phones and tablets (`mobile.spec.ts`), with a stand-in on-screen keyboard: the tools above it, there only while
  the text has focus, the tab bar making way and toasts rising, Done, Undo, Redo and Bold leaving the text in focus,
  Add to World first in line, the cursor kept above the bar as the keyboard comes up and while typing, focus mode,
  and Write's panel on a phone and a tablet, its handle closing it, and a short drag springing back;
- accessibility (`a11y.spec.ts`): axe at each page, panel, menu and dialog on walks through the home screen, help and
  Search, the Plan's views and pop-out, Write and its writing aids, the AI tools, World, the Inbox and dictation, the
  book's dialogs, and a phone, holding them to WCAG 2.2 A and AA and axe's best practices, with the color rules run
  again in the sepia and dark themes;
- touch targets (`touch.spec.ts`): on a phone and a tablet, every control on the Board, its menus, the chapter
  pop-out, a toast, the Outline, the Write screen with its menus, History, chapter plan and World panel, World, the
  writing aids (Goals and sprints, Find and replace, Add to World, the tools above the keyboard, the reading bar and
  focus mode), the AI tools (the panel and its cards, AI settings and your own tools), the Import dialog with its
  menus, the backup reminder, the Backups dialog, the Inbox (its menus, File this note, Quick note), dictation (Set
  up dictation and the Listening pill), the home screen and its install notice, the help menu, the glossary, a tour
  card and Search must be at least 44 px.

Use `npx playwright test --ui` to debug, and `--project=chrome` or `--project=pwa` for the dev server's tests or the
offline ones alone. A failed test keeps a trace in `test-results/`; open it with `npx playwright show-trace <path>`.

### Performance

`npm run perf` builds the app, serves the build on port 4175, and in Chrome imports a made-up book of 161,741 words
(100 chapters, 246 scenes). Then it times typing in a chapter, opening chapters, scrolling and typing in the
Manuscript, dragging a card on the Board and opening the home screen, and adds up the JavaScript the home screen needs.
It prints each beside its budget in DESIGN.md §17, where the last results are. `npm run perf -- 4` slows the CPU
fourfold, as on a low-end laptop. A run takes about three minutes.

## Phone keyboards

Android keyboards compose words before committing them, and that's where ProseMirror editors break. `/lab/ime` is a
test bench for it: the scene editor with live checks and an event log. The desktop e2e suite replays one composition,
but real keyboards need a manual pass: [docs/ime-smoke-test.md](docs/ime-smoke-test.md).

The tools above the keyboard are tested with a stand-in, `fakeKeyboard` in `e2e/fixtures.ts`, which shrinks the
visual viewport as Chrome on Android does. The same doc lists what to check on a real phone or tablet.

## How scene text is stored

Each scene is a Y.Doc. `SceneDocProvider` (`src/yjs/`) appends every local edit as a row in `scene_updates` and applies
rows written by other tabs as they appear. Compaction folds the rows into one `snapshots` row of kind `compaction`. It
runs:
- after 500 rows;
- after 30 s without edits, once 50 rows have built up;
- when the scene closes.

Snapshot-plus-updates is the same layout DESIGN.md §11 plans for syncing between devices later.

A scene's History lives in `snapshots` too, as rows of kind `auto` or `manual` holding the prose alone. Restoring
one replaces the live doc's prose with a copy in a single edit, so it's saved, and reaches other tabs, like typing.

## Project layout

```text
src/
  ai/             providers, requests and streamed answers, what a run sends, the tools and your own, cards and runs
  app/            shell, routes and each page's own download, startup and error screens, theme, toasts and
                  announcements, the service worker and updates, installing, the desktop build, dev hooks
  backup/         backup status, folder backups, and when backups run
  components/     fields that save as you type, menus for long lists; ui/ holds the shadcn components
  db/             PowerSync schema, queries, sample book and seeding, ordering, undo, Trash, prefs, the scene store,
                  writing stats, scene versions
  editor/         TipTap scene editor, its extensions, open scene docs, the active editor, codex name matching
  export/         manuscript, Word, Markdown and plain-text files, backups and restoring them
  features/       plan/ (Board, Outline, chapter pop-out), write/ (views, toolbar, the tools above the keyboard,
                  navigator, History, side panel with the chapter plan and World, hover cards, dictation into the
                  text, and ai/ with the AI tools panel, its cards and settings), home/ (the home screen and its
                  install notice), help/ (glossary, tours, "?" buttons), books/ (book dialogs and style), export/
                  (Export and Restore dialogs), import/ (Import dialog and its preview), backup/ (the reminder and the
                  Backups dialog), codex/ (the World screen, entry pages, Appears in), inbox/ (the Inbox, filing and
                  Quick note), dictation/ (Dictate, its setup and the Listening pill), lab/ (IME lab)
  import/         reading Word, Markdown and plain text, splitting into acts, chapters and scenes, writing the book
  lib/            small helpers (ids, word counts, numbers, keys, focus, colors, plain text as rich text, where the
                  on-screen keyboard is)
  speech/         speech recognition: the engine, dictation sessions, voice commands and their settings
  test/           in-memory SQLite and book builders for unit tests
  yjs/            SceneDocProvider, the scene store interface, Yjs helpers
e2e/              Playwright tests; preview.ts, which builds and serves the app for the offline tests; and perf.ts,
                  which times it with a long book (`npm run perf`)
docs/             design doc and the phone keyboard test
prototype/        the clickable design prototype
public/           favicon and the app's icons; theme-init.js sets the theme and title bar color before first paint
scripts/          icons.ts draws the web app's and the Windows app's icons from the favicon (`npm run icons`)
src-tauri/        the Windows app: its window, installer and icons (tauri.conf.json), and its Rust side (src/lib.rs)
```

## Dev hooks

Development builds expose `window.__bbb` for the console and the end-to-end tests:
- `db`: the PowerSync database. For example, `await __bbb.db.getAll("select * from scene_updates")`.
- `openScenes()`: ids of the scenes open in this tab.
- `flushAll()`: resolves once every edit in this tab has been written.
- `compactAll()`: compacts every open scene now.
- `settleAll()`: saves pending word counts and versions now, instead of after their delays.
- `backUpNow()`: runs a backup check now, writing to the backup folder if there is one. Resolves to `"up-to-date"`,
  `"failed"` or `"skipped"` (no folder it can write to).
- `setTheme(theme)`: switches to the `"light"`, `"sepia"` or `"dark"` theme, as the header's Theme control does.
