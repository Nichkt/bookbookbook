# bookbookbook

A novel planner and writing app: plan what happens in each chapter, then write chapter by chapter. The organizing side
takes after NovelCrafter, the writing side after Sudowrite.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md) covers every product and technical decision and the milestone plan.
- **Prototype:** [prototype/](prototype/README.md) is a clickable mock of the whole app. Open `prototype/index.html`.

## Status: M2, editor core

Milestones 0 to 2 from DESIGN.md §19 are built. Everything stays on the device; there are no accounts or sync yet.
The Codex and Inbox tabs are placeholders until M3 and M11.

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
- **Books:** create, switch and edit them (title, genre, target length) from the header's book menu, which also holds
  the Trash.
- **Board:** acts as rows of chapter cards. Drag cards within and between acts, or move them with Alt+arrow keys.
  Display presets (Compact, Standard, Detailed) with per-field toggles, remembered per view. Filters by POV, status
  and plot thread.
- **Outline:** acts, chapters, scenes and beats in one keyboard-first tree. Enter adds an item. Tab folds one into the
  item above and Shift+Tab splits it off, both with Undo. Alt+↑/↓ moves.
- **Chapter drawer:** status, POV, target, location, story time, threads, characters present, labels, summary, beats,
  scenes and notes, saved as you type. Pickers can create codex entries. Docked beside the view on wide screens, a
  sheet on smaller ones.
- **Trash:** chapters, scenes and books stay for 30 days. Undo right away, or restore from the book menu.
- **Write:** the navigator lists chapters under their acts, and each chapter links to its details in Plan.
- **Touch:** every control is at least 44 px on touch screens, and the Board stacks into one column on phones.

**M0, foundations:**
- **Local-only database:** PowerSync's SQLite in the browser, with the full schema.
- **Scene editor:** TipTap on a Yjs document per scene. Edits are saved as you type, and open tabs show the same text.
- **Codex name underlines** that hold still while a phone keyboard is mid-word (see [Phone keyboards](#phone-keyboards)).
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

Open <http://localhost:5173>. To start over with a fresh sample book, clear the site's data (DevTools → Application →
Storage → Clear site data) and reload.

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
- word counts and the day's writing stats, scene versions (saving, pruning, restoring) and how History compares them;
- the Scene view's reading order, and shortcut labels and keys.

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
- the planner (`plan.spec.ts`): dragging and keyboard moves on the Board, display presets, filters, the drawer and
  its URL, the Trash, folding and splitting in the Outline, and the links between Plan and Write;
- the Write screen (`write.spec.ts`): the three views and their addresses, a jump holding still while the
  Manuscript settles, which scene the toolbar acts on, formatting, naming, adding and trashing scenes, History, Today
  and the chapter plan;
- touch targets (`touch.spec.ts`): on a phone and a tablet, every control on the Board, its menus, the drawer, a toast,
  the Outline, and the Write screen with its menus, History and chapter plan must be at least 44 px.

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
  components/     fields that save as you type; ui/ holds the shadcn components
  db/             PowerSync schema, queries, sample book and seeding, ordering, undo, Trash, prefs, the scene store,
                  writing stats, scene versions
  editor/         TipTap scene editor, its extensions, open scene docs, the active editor, codex name matching
  features/       plan/ (Board, Outline, drawer), write/ (views, toolbar, navigator, History, chapter plan), books/,
                  codex/, lab/ (IME lab)
  lib/            small helpers (ids, word counts, numbers, keys, focus)
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
