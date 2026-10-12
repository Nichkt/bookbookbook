# bookbookbook

A novel planner and writing app: plan what happens in each chapter, then write chapter by chapter. The organizing side
takes after NovelCrafter, the writing side after Sudowrite.

- **Design:** [docs/DESIGN.md](docs/DESIGN.md) covers every product and technical decision and the milestone plan.
- **Prototype:** [prototype/](prototype/README.md) is a clickable mock of the whole app. Open `prototype/index.html`.

## Status: M0, foundations

This is milestone 0 from DESIGN.md §19: the groundwork and the riskiest technical pieces, before any real features.

- **App shell** with Plan, Write and Codex tabs (Plan and Codex are placeholders), responsive down to phone width.
- **Local-only database:** PowerSync's SQLite in the browser, with the full schema. Nothing leaves the device; there
  are no accounts or sync yet.
- **Scene editor:** TipTap on a Yjs document per scene. Edits are saved as you type, and open tabs show the same text.
- **Codex name underlines** that hold still while a phone keyboard is mid-word (see [Phone keyboards](#phone-keyboards)).
- **Themes:** light, sepia and dark, built on design tokens (DESIGN.md §15).
- **Sample book,** *The Ferry Home*, created on first run.

## Requirements

- Node.js 22.12 or newer (developed on 24).
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

**Unit tests** live next to the code (`src/**/*.test.ts`) and run in Node. They cover scene saving and compaction
(`SceneDocProvider` against an in-memory store), the mention highlighter, codex name matching, word counts, and the
Yjs helpers.

**End-to-end tests** (`e2e/`) run in your installed Chrome against a dev server on port 5174, which Playwright starts
(or reuses if it's already running). Every test gets a fresh browser profile, so each one starts from the sample book.
They cover:
- startup;
- typing and reloading;
- compaction;
- two tabs converging;
- the theme setting;
- the phone layout;
- a phone-style keyboard composition, replayed through the Chrome DevTools Protocol.

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

## Project layout

```text
src/
  app/            shell, routes, startup and error screens, theme, dev hooks
  components/ui/  shadcn components
  db/             PowerSync schema, queries, sample book and seeding, the SQLite scene store
  editor/         TipTap scene editor, its extensions, codex name matching
  features/       screens: write/, lab/ (the IME lab)
  lib/            small helpers (ids, word counts)
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
