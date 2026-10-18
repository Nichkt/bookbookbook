import { shortcutLabel } from "@/lib/keys"
import type { TourId } from "./helpStore"

/** What a step's text can depend on. */
export interface TourContext {
  /** Below 48rem, where the Write toolbar folds most of its tools into a ⋯ menu. */
  narrow: boolean
  /** A touch screen, with no mouse to rest on things. */
  coarse: boolean
  pathname: string
}

type TourText = string | ((context: TourContext) => string)

/** One stop on a page tour (DESIGN.md §17a). */
export interface TourStep {
  /**
   * The `data-tour` value of what the step points at, matched as one of the attribute's words; the first one showing
   * wins. When none is showing, the card sits in the middle of the screen.
   */
  target?: string
  title: string
  body: TourText
  /** A glossary term the step offers to explain. */
  term?: string
  /** What the page needs open for the step: the tour opens it, and closes it again after. */
  stage?: "chapter-popout"
  /** Only on screens where this holds, such as one of the Plan's views. */
  when?: (context: TourContext) => boolean
}

export interface TourDefinition {
  /** The tour dialog's name. */
  title: string
  steps: TourStep[]
}

export const textOf = (text: TourText, context: TourContext) => (typeof text === "string" ? text : text(context))

/** The steps a tour takes on this screen. */
export const stepsFor = (tour: TourDefinition, context: TourContext) =>
  tour.steps.filter((step) => !step.when || step.when(context))

const inMenu = (body: string) => (context: TourContext) =>
  context.narrow ? `${body} On a small screen, it's in the ⋯ menu.` : body

/** The Plan view the screen shows: the Board until it says otherwise. */
const planView = (context: TourContext) => /\/plan\/([a-z]+)/.exec(context.pathname)?.[1] ?? "board"
const isOutline = (context: TourContext) => planView(context) === "outline"
const inViews =
  (...views: string[]) =>
  (context: TourContext) =>
    views.includes(planView(context))

const HOME: TourDefinition = {
  title: "How to use the home screen",
  steps: [
    {
      title: "Welcome to bookbookbook",
      body: "This is your home screen, where every book you're working on lives. Your books are saved in this browser, on this device.",
    },
    {
      target: "home-books",
      title: "Your books",
      body: "Click a book to open it where you left off. The bar under each one shows how close it is to its word count target.",
      term: "word-count-target",
    },
    {
      target: "home-new",
      title: "Start a new book",
      body: "Give it a title and a word count target, and choose how to start: with one blank chapter, a chapter for each moment of a story structure, or a few questions that plan it step by step.",
      term: "story-structure",
    },
    {
      target: "home-import",
      title: "Bring in a book you've started",
      body: "Import a Word document, Markdown or plain text file. You'll see where its chapters start, and can change that, before anything's added.",
      term: "import",
    },
    {
      target: "home-restore",
      title: "Restore a backup",
      body: "Bring back a book from a backup file, if something went wrong or you're moving to another computer.",
      term: "backup",
    },
    {
      target: "home-backups",
      title: "Keep a copy safe",
      body: "Pick a folder, like one your cloud drive syncs, and bookbookbook copies every book there as it changes.",
      term: "backup",
    },
    {
      target: "home-trash",
      title: "The Trash",
      body: "Books you delete wait here for 30 days, so you can bring them back.",
      term: "trash",
    },
    {
      target: "help-glossary",
      title: "Not sure what a word means?",
      body: "The Glossary explains every term in plain English: scenes, moments, point of view, and the rest. Look for a small ? beside a label, too.",
    },
    {
      target: "help-tour",
      title: "A tour on every page",
      body: "The Plan, Write, World and Inbox pages each have their own tour. Click How to use this on any page to walk through it.",
    },
  ],
}

const PLAN: TourDefinition = {
  title: "How to use the Plan",
  steps: [
    {
      title: "The Plan",
      body: "This is where you organize your book: its acts, its chapters, and what happens in each one. Plan as much or as little as you like. Everything saves as you type.",
    },
    {
      target: "plan-views",
      title: "Five ways to see it",
      body: "The Board shows your chapters as cards, the Corkboard as index cards, and the Outline as a list. The Matrix shows who and what is in each chapter, and the Timeline when each one happens in the story. They're all the same plan.",
      term: "plan-page",
    },
    {
      target: "plan-structure",
      title: "Story structure",
      body: "Choose a story structure, like the three-act structure, to see which of its turning points your chapters deliver. Make your own here too, or plan the book step by step, starting from a single sentence.",
      term: "story-structure",
    },
    {
      target: "plan-ribbon",
      when: inViews("board", "corkboard"),
      title: "The structure ribbon",
      body: "Once your book follows a story structure, a ribbon above the chapters shows each of its moments, where it should land in the book. Click one to mark the chapter that delivers it.",
      term: "structure-ribbon",
    },
    {
      target: "plan-act",
      when: inViews("board", "corkboard", "outline"),
      title: "Acts",
      body: "Chapters are grouped into acts: the big parts of your story, like its beginning, middle and end. Click an act's name to rename it.",
      term: "act",
    },
    {
      target: "plan-chapter",
      when: inViews("board", "corkboard", "outline"),
      title: "Chapters",
      body: (context) =>
        isOutline(context)
          ? `Each line is a chapter, with its moments and scenes beneath it. ${
              context.coarse
                ? "Tap the title to rename it, or the ⤢ button at the end of its line to pop out everything planned for it."
                : "Click the title to rename it. Point at a chapter and a ⤢ button shows at the end of its line: click it to pop out everything planned for it."
            }`
          : planView(context) === "corkboard"
            ? "Each index card is a chapter: type its title and summary right on it. Click the strip along its top to pop out everything planned for it, or drag the strip to change the order."
            : "Each card is a chapter. Click one to pop out everything planned for it. Drag cards to change the order.",
      term: "chapter",
    },
    {
      target: "plan-matrix",
      when: inViews("matrix"),
      title: "The Matrix",
      body: "A column for each chapter, and a row for each character and story point. Click a square to say whether they're in that chapter, or a chapter's number to pop out everything planned for it.",
      term: "matrix",
    },
    {
      target: "plan-timeline-order",
      when: inViews("timeline"),
      title: "The Timeline",
      body: "Story order shows when each chapter happens in the story. Reading order shows them as readers meet them, with each jump back or forward in time marked. Give a chapter a story time to place it here.",
      term: "timeline",
    },
    {
      target: "popout-moments",
      stage: "chapter-popout",
      title: "Moments",
      body: "The things that happen in the chapter, in order: a discovery, a decision, an argument. Writers call these beats. List them before you write, then tick each one off once it's on the page.",
      term: "moment",
    },
    {
      target: "popout-details",
      stage: "chapter-popout",
      title: "The details",
      body: "Whose eyes we see the chapter through, where and when it happens, who's there, and how many words you're aiming for. Click the ? beside any of them for an explanation.",
      term: "point-of-view",
    },
    {
      target: "popout-write",
      stage: "chapter-popout",
      title: "Write this chapter",
      body: "When you're ready to write, this takes you straight to the chapter's page, with its plan a click away.",
    },
    {
      target: "plan-add",
      title: "Add acts and chapters",
      body: "New chapters and acts go at the end of the book. Move them wherever they belong.",
    },
    {
      target: "plan-display",
      when: inViews("board", "outline"),
      title: "Show more, or less",
      body: "Choose what the cards and lines show: just titles, or summaries, moments, who's there and more.",
    },
    {
      target: "plan-filter",
      title: "Filter",
      body: "Pick a point of view, a status or a story point, and the chapters that don't match fade back. Handy for following one storyline through the book.",
      term: "story-point",
    },
    {
      title: "That's the Plan",
      body: "When a chapter's ready, write it on the Write page. If a word here puzzles you, the Glossary is in the top bar.",
    },
  ],
}

const WRITE: TourDefinition = {
  title: "How to use Write",
  steps: [
    {
      title: "Write",
      body: "This is where you write your book, a chapter at a time. Everything you type is saved as you go.",
    },
    {
      target: "write-chapters",
      title: "Your chapters",
      body: (context) =>
        context.narrow
          ? "Pick a chapter here to jump to it."
          : "Show or hide the list of chapters beside the page, and click one to jump to it.",
    },
    {
      target: "write-views",
      title: "Scene, Chapter or Manuscript",
      body: inMenu("Choose how much you see at once: one scene, a whole chapter, or the whole book from start to finish."),
      term: "scene",
    },
    {
      target: "write-heading",
      title: "The chapter at a glance",
      body: "Its number, status and title, the summary from your plan, and a bar showing how close it is to its word count target. Plan opens the chapter's plan.",
    },
    {
      target: "write-editor",
      title: "The page",
      body: (context) =>
        context.coarse
          ? "Tap and type. Select words and use the toolbar for bold and italic. Names from your World are underlined: open World to read about them."
          : `Click and type. Select words and use the toolbar, or ${shortcutLabel("Mod+B")} and ${shortcutLabel("Mod+I")}, for bold and italic. Names from your World are underlined: rest the mouse on one to see who or what it is.`,
      term: "mention",
    },
    {
      target: "write-history",
      title: "History",
      body: inMenu(
        "bookbookbook keeps earlier versions of each scene as you write. Open History to look back at them, or bring one back.",
      ),
      term: "version",
    },
    {
      target: "write-plan-panel",
      title: "Chapter plan",
      body: inMenu("Opens the chapter's plan beside the page: its moments, who's there, notes and the rest. Tick off moments as you write them."),
    },
    {
      target: "write-world-panel",
      title: "World",
      body: inMenu("Opens your World beside the page, starting with who and what this chapter mentions, so you can check a detail without losing your place."),
      term: "world",
    },
    {
      target: "write-find",
      title: "Find and replace",
      body: (context) =>
        inMenu(
          context.coarse
            ? "Search the whole book for a word or a name, going from match to match, and replace them one at a time or all at once."
            : `Search the whole book for a word or a name, going from match to match with Enter, and replace them one at a time or all at once. ${shortcutLabel("Mod+Shift+F")} searches for the words you've selected.`,
        )(context),
      term: "find-and-replace",
    },
    {
      target: "write-ai",
      title: "AI tools",
      body: (context) =>
        inMenu(
          context.coarse
            ? "Optional help from an AI when you ask: it can carry on from your cursor, rewrite what you select, brainstorm and more. Connect it once in AI settings. Nothing goes into your book until you put it there."
            : `Optional help from an AI when you ask: it can carry on from your cursor (${shortcutLabel("Mod+J")}), rewrite what you select, brainstorm and more. Connect it once in AI settings. Nothing goes into your book until you put it there.`,
        )(context),
      term: "ai-tools",
    },
    {
      target: "write-today",
      title: "Today, goals and sprints",
      body: (context) =>
        context.narrow
          ? "The ⋯ menu also shows how many words you've added to this book today, and has Goals and sprints, for a daily goal or a timed burst of writing."
          : "How many words you've added to this book today, less any you've cut. Open it to set a daily goal, or to time a burst of writing in a sprint.",
      term: "daily-goal",
    },
    {
      target: "write-focus",
      title: "Focus mode",
      body: (context) =>
        inMenu(
          context.coarse
            ? "Clears away everything but your text, and fades the paragraphs you aren't writing."
            : `Clears away everything but your text, and fades the paragraphs you aren't writing. ${shortcutLabel("Mod+.")} starts it, and Esc ends it.`,
        )(context),
      term: "focus-mode",
    },
    {
      target: "write-more",
      title: "More writing tools",
      body: (context) =>
        `${context.narrow ? "In the ⋯ menu, Add" : "Add"} to World makes an entry for a name selected in your text, Read aloud reads your words back to you, and Typewriter scrolling keeps the line you're writing mid-window.`,
      term: "add-to-world",
    },
    {
      title: "Happy writing",
      body: "Write a little at a time, and come back to the Plan whenever the story needs rethinking.",
    },
  ],
}

const WORLD: TourDefinition = {
  title: "How to use World",
  steps: [
    {
      title: "Your World",
      body: "Keep track of everything in your story that isn't the text itself: its characters, places, story points, and anything else you want to remember.",
      term: "world",
    },
    {
      target: "world-types",
      title: "Kinds of entries",
      body: "Entries are sorted into kinds, like Characters, Locations and Story points. Pick one to see its entries. You can add your own kinds, too, like Ships or Spells.",
      term: "entry-type",
    },
    {
      target: "world-new",
      title: "Add an entry",
      body: "Make a new entry of this kind. Give it a name, and any other names it goes by, so bookbookbook can spot it in your text.",
      term: "entry",
    },
    {
      target: "world-search",
      title: "Find anything",
      body: "Search every entry at once, by name or by anything you've written about it, or show only the entries with a tag.",
    },
    {
      target: "world-list",
      title: "Your entries",
      body: "Click an entry to open it.",
    },
    {
      target: "world-entry",
      title: "An entry",
      body: "Everything about one thing in your story: its details, your notes, and Appears in, the chapters it turns up in. Changes save as you type.",
      term: "aliases",
    },
    {
      title: "Use it while you write",
      body: "On the Write page, World opens your entries beside the text, and their names are underlined in it, so the details are always close by.",
      term: "mention",
    },
  ],
}

const INBOX: TourDefinition = {
  title: "How to use the Inbox",
  steps: [
    {
      title: "The Inbox",
      body: "A place to catch ideas the moment they come, typed or spoken, and sort them into chapters later.",
      term: "inbox",
    },
  ],
}

export const TOURS: Record<TourId, TourDefinition> = { home: HOME, plan: PLAN, write: WRITE, world: WORLD, inbox: INBOX }

/** The tour for the page at `pathname`, if it has one. */
export function tourForPath(pathname: string): TourId | null {
  if (pathname === "/") return "home"
  const page = /^\/b\/[^/]+\/(plan|write|world|inbox)(?:\/|$)/.exec(pathname)?.[1]
  return (page as TourId | undefined) ?? null
}
