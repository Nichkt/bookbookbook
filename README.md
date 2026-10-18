# bookbookbook

A novel planner and writing app: plan what happens in each chapter, then write chapter by chapter. The organizing side
takes after NovelCrafter, the writing side after Sudowrite.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md) covers every product and technical decision and the milestone plan.
- **Prototype:** [prototype/](prototype/README.md) is a clickable mock of the whole app. Open `prototype/index.html`.

## Status: home, planner, World, editor, help, import, export and backups

Milestones 0 to 3 and 7 from DESIGN.md §19 are built, plus a home screen, a glossary and a tour of every page.
Everything stays on the device; there are no accounts or sync yet, so keep backups: Backups… in the book menu downloads
one, or backs every book up to a folder as it changes (Chrome and Edge).
The Inbox tab is a placeholder until M11.

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
- **Glossary:** the header's Glossary button explains every term in plain English, with examples from the sample
  book. Search finds the trade's words too ("beat", "POV", "codex"). The "?" beside each of a chapter's fields opens
  its entry.
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

The sample book, *The Salt Ledger*, is created on first run.

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
any page for a tour, or **Glossary** for what the words mean. To start over with a fresh sample book, clear the
site's data (DevTools → Application → Storage → Clear site data) and reload.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at <http://localhost:5173> |
| `npm run dev:lan` | The same, reachable from other devices on your network (phone testing) |
| `npm run build` | Type-checks, then builds to `dist/` |
| `npm run preview` | Serves the build |
| `npm run typecheck` | `tsc -b` over the app, tests and configs |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |

## Tests

**Unit tests** live next to the code (`src/**/*.test.ts`) and run in Node. Tests that write to the database use an
in-memory SQLite with the app's schema (`node:sqlite`; helpers in `src/test/`). They cover:
- scene saving and compaction (`SceneDocProvider` against an in-memory store);
- the mention highlighter, codex name matching, word counts, number entry in any locale and the Yjs helpers;
- the plan's edits (create, move, fold, split, trash) and their exact undo;
- ordering keys, story time, the Board's drop targets and the Outline's keyboard paths;
- books, codex entries, the sample book and the Trash;
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
- help: every glossary term's links and search (old names included), every tour step's copy on touch and narrow
  screens, and where a tour card goes beside, over or without what it points at.

**End-to-end tests** (`e2e/`) run in your installed Chrome against a dev server on port 5174, which Playwright starts
(or reuses if it's already running). Every test gets a fresh browser profile, so each one starts from the sample book.
They cover:
- startup;
- typing and reloading;
- compaction;
- two tabs converging;
- the theme setting;
- the phone layout;
- a phone-style keyboard composition, replayed through the Chrome DevTools Protocol;
- the planner (`plan.spec.ts`): dragging and keyboard moves on the Board, display presets, filters, the chapter
  pop-out (its fields, Previous and Next, Write this chapter) and its URL, the Trash, folding and splitting in the
  Outline, and the links between Plan and Write;
- the Write screen (`write.spec.ts`): the three views and their addresses, a jump holding still while the
  Manuscript settles, which scene the toolbar acts on, formatting, naming, adding and trashing scenes, History, Today
  and the chapter plan;
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
  Done, the Plan tour opening a chapter's pop-out and closing it, a term explained mid-tour, and leaving the page;
- touch targets (`touch.spec.ts`): on a phone and a tablet, every control on the Board, its menus, the chapter
  pop-out, a toast, the Outline, the Write screen with its menus, History, chapter plan and World panel, World, the
  Import dialog with its menus, the backup reminder, the Backups dialog, the home screen, the help menu, the glossary
  and a tour card must be at least 44 px.

Use `npx playwright test --ui` to debug. A failed test keeps a trace in `test-results/`; open it with
`npx playwright show-trace <path>`.

## Phone keyboards

Android keyboards compose words before committing them, and that's where ProseMirror editors break. `/lab/ime` is a
test bench for it: the scene editor with live checks and an event log. The desktop e2e suite replays one composition,
but real keyboards need a manual pass: [docs/ime-smoke-test.md](docs/ime-smoke-test.md).

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
  app/            shell, routes, startup and error screens, theme, toasts and announcements, dev hooks
  backup/         backup status, folder backups, and when backups run
  components/     fields that save as you type; ui/ holds the shadcn components
  db/             PowerSync schema, queries, sample book and seeding, ordering, undo, Trash, prefs, the scene store,
                  writing stats, scene versions
  editor/         TipTap scene editor, its extensions, open scene docs, the active editor, codex name matching
  export/         manuscript, Word, Markdown and plain-text files, backups and restoring them
  features/       plan/ (Board, Outline, chapter pop-out), write/ (views, toolbar, navigator, History, side panel with
                  the chapter plan and World, hover cards), home/ (the home screen), help/ (glossary, tours, "?"
                  buttons), books/, export/ (Export and Restore dialogs), import/ (Import dialog and its preview),
                  backup/ (the reminder and the Backups dialog), codex/ (the World screen, entry pages, Appears in),
                  lab/ (IME lab)
  import/         reading Word, Markdown and plain text, splitting into acts, chapters and scenes, writing the book
  lib/            small helpers (ids, word counts, numbers, keys, focus, colors, plain text as rich text)
  test/           in-memory SQLite and book builders for unit tests
  yjs/            SceneDocProvider, the scene store interface, Yjs helpers
e2e/              Playwright tests
docs/             design doc and the phone keyboard test
prototype/        the clickable design prototype
public/           favicon; theme-init.js sets the theme before first paint
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
