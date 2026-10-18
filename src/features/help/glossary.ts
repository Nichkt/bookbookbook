/*
 * The glossary (DESIGN.md §17a): every word the app uses that a new writer might not know, in plain English, with an
 * example from the sample book where one helps. Ids are stable: TermHint buttons and tours link to them.
 */

export type GlossaryGroup = "story" | "chapter" | "world" | "app"

export interface GlossaryTerm {
  id: string
  term: string
  /** Other names for the same thing, which search finds too. */
  aka?: string[]
  group: GlossaryGroup
  /** Paragraphs. */
  body: string[]
  /** Short items shown as a list after the paragraphs. */
  items?: string[]
  /** From the sample book, The Salt Ledger. */
  example?: string
  /** Ids of terms worth reading next. */
  related?: string[]
}

export const GLOSSARY_GROUPS: { id: GlossaryGroup; title: string }[] = [
  { id: "story", title: "Story basics" },
  { id: "chapter", title: "Planning a chapter" },
  { id: "world", title: "Your world" },
  { id: "app", title: "Pages and tools" },
]

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: "act",
    term: "Act",
    group: "story",
    body: [
      "A big part of the story, made up of several chapters. Many novels have three acts: a beginning that sets things up, a middle where the trouble builds, and an end where it comes to a head.",
      "On the Plan, each act is a band of the Board holding its chapters' cards, and the top level of the Outline. Name them, add more, or keep everything in one.",
    ],
    example: "The Salt Ledger has three acts: “Arrival”, “The Ledger” and “The Light”.",
    related: ["chapter", "structure-moment"],
  },
  {
    id: "chapter",
    term: "Chapter",
    group: "story",
    body: [
      "A numbered part of the book, as readers see it. Each chapter has its own plan (what happens in it, who's there, where and when) and its own text.",
      "You plan and write a book here one chapter at a time.",
    ],
    example: "Chapter 2 of The Salt Ledger is “The Keeper's Room”.",
    related: ["scene", "moment", "act"],
  },
  {
    id: "scene",
    term: "Scene",
    group: "story",
    body: [
      "A stretch of story that happens in one place, at one time, usually seen through one character's eyes. When the story jumps to another place or time, or to someone else's point of view, a new scene begins.",
      "A chapter can be one scene or several. Scenes are optional: a chapter without them is written as one piece. Add scenes when you want to plan or move the parts of a chapter separately.",
    ],
    example:
      "Chapter 2 has two scenes: “The locked room”, where Mara finds the ledger, and “A key in the spine”, where she finds the key.",
    related: ["moment", "chapter", "point-of-view"],
  },
  {
    id: "moment",
    term: "Moment",
    aka: ["Beat", "Story beat"],
    group: "story",
    body: [
      "One thing that happens in the story: a single step, like a discovery, a decision, an argument or a surprise. Writers usually call these beats.",
      "A beat is the smallest piece of a story. A few beats make a scene, and a few scenes make a chapter. Listing a chapter's moments before you write it gives you a path to follow: write toward each one, then tick it off once it's on the page.",
      "This app says moment because it's the plainer word.",
    ],
    example:
      "The moments of chapter 2: “Unlock the keeper's room”, “Find the Salt Ledger”, “Notice ships that never existed” and “Pocket the brass key”.",
    related: ["scene", "structure-moment"],
  },
  {
    id: "structure-moment",
    term: "Structure moment",
    aka: ["Template beat", "Beat sheet", "Story structure", "Save the Cat"],
    group: "story",
    body: [
      "A turning point from a story-structure guide. Guides like Save the Cat map out the moments most stories pass through, such as the Catalyst (the event that sets the story going) or the Midpoint (where everything changes).",
      "When a book is planned with one of these guides, each chapter can say which of its moments it delivers. It's a planning aid, not a rule.",
    ],
    example: "Chapter 2 of The Salt Ledger is its Catalyst: Mara finds the ledger, and the mystery begins.",
    related: ["moment", "act"],
  },
  {
    id: "point-of-view",
    term: "Point of view",
    aka: ["POV", "Viewpoint", "Narrator"],
    group: "story",
    body: [
      "Whose eyes the reader sees the story through: the character whose thoughts and feelings the text can show. Readers know what that character knows, and nothing they don't.",
      "Many novels stay with one point-of-view character for each chapter or scene, and some switch between a few. Setting it for each chapter makes the balance easy to check.",
    ],
    example: "Most of The Salt Ledger is seen through Mara's eyes, but chapter 4, “Low Tide”, follows her brother Jonas.",
    related: ["characters-present", "scene"],
  },
  {
    id: "story-point",
    term: "Story point",
    aka: ["Plot thread", "Subplot", "Storyline", "Thread"],
    group: "story",
    body: [
      "A storyline that runs through several chapters: a mystery to solve, a romance, a rivalry, a debt to pay off. Writers also call these plot threads or subplots.",
      "Tag each chapter with the story points it moves forward. Then you can filter the Plan to one story point to follow it through the book, and spot one that goes quiet for too long.",
    ],
    example: "The Salt Ledger has four: the Ledger mystery, Mara & Elias, Jonas's debts, and Grief.",
    related: ["theme", "chapter"],
  },
  {
    id: "theme",
    term: "Theme",
    group: "story",
    body: [
      "What the story is about underneath its events: the idea or question it keeps coming back to. It's rarely stated outright; it shows in what the characters face and choose.",
    ],
    example: "The Salt Ledger's theme is “What we inherit”: from parents, from a place, from the past.",
    related: ["story-point"],
  },
  {
    id: "draft",
    term: "Draft",
    group: "story",
    body: [
      "A version of the book's text. The first draft is the first time you write it all the way through; later drafts rework it. Messy first drafts are normal.",
    ],
    related: ["status", "version"],
  },
  {
    id: "manuscript",
    term: "Manuscript",
    group: "story",
    body: [
      "The book's whole text, from the first chapter to the last. In Write you can read it as one long page, and Export turns it into a file to share or send to an editor.",
    ],
    related: ["export"],
  },

  {
    id: "status",
    term: "Status",
    group: "chapter",
    body: ["How far along a chapter is. Each card shows it as a colored dot and a word:"],
    items: [
      "Idea: just a thought so far.",
      "Outlined: planned, but not written yet.",
      "Drafting: being written.",
      "Revising: written, and being improved.",
      "Done: finished, for now.",
    ],
    related: ["draft"],
  },
  {
    id: "summary",
    term: "Summary",
    group: "chapter",
    body: [
      "A few sentences on what happens in the chapter: what you'd tell a friend who asked. It shows on the chapter's card, and at the top of the chapter in Write.",
    ],
    example:
      "Chapter 1: “Mara Quill returns to Grayhaven for Thomas's funeral and finds the island smaller, sharper, and less willing to forgive absence.”",
    related: ["moment"],
  },
  {
    id: "word-count-target",
    term: "Word count target",
    aka: ["Target", "Word goal", "Length"],
    group: "chapter",
    body: [
      "How long you'd like a chapter, or the whole book, to be, in words. Progress bars show how close you are.",
      "As a rough guide, many novels run 70,000 to 100,000 words, and many chapters 2,000 to 5,000. Targets are only there to help you pace yourself.",
    ],
    example: "The Salt Ledger aims for 90,000 words, about 3,000 a chapter.",
  },
  {
    id: "characters-present",
    term: "What characters are present",
    aka: ["Characters present", "Cast"],
    group: "chapter",
    body: [
      "The characters who appear in the chapter. Pick them from your World, or type a new name to add one.",
      "It helps you check who is where, and filter the Plan to the chapters a character is in.",
    ],
    example: "In chapter 1: Mara, Jonas and Elias.",
    related: ["point-of-view", "world"],
  },
  {
    id: "location",
    term: "Location",
    aka: ["Setting", "Place"],
    group: "chapter",
    body: ["Where the chapter happens: a place from your World. Pick one, or type a new name to add it."],
    example: "Chapter 2 happens at the Lighthouse.",
    related: ["world"],
  },
  {
    id: "story-time",
    term: "Story time",
    aka: ["Timeline", "In-story date", "When"],
    group: "chapter",
    body: [
      "When the chapter happens inside the story, not when you wrote it: “Day 1, morning”, “Summer 1921”, or a full date and time.",
      "It keeps the order of events straight, which matters most when chapters jump back and forth in time.",
    ],
    example: "Chapter 1 happens on “Day 1 morning”, and chapter 2 that night.",
  },
  {
    id: "labels",
    term: "Labels",
    aka: ["Tags"],
    group: "chapter",
    body: [
      "Your own short tags for chapters, for anything that helps you sort or find them, like “flashback”, “needs research” or “action”. They show on the chapter cards.",
    ],
  },
  {
    id: "notes",
    term: "Notes",
    group: "chapter",
    body: [
      "Anything else about a chapter or an entry: research, reminders, ideas for later. Notes are for you; they never appear in the book's text.",
    ],
  },

  {
    id: "world",
    term: "World",
    aka: ["Codex", "Story bible", "Encyclopedia", "Wiki"],
    group: "world",
    body: [
      "Your story's encyclopedia: everyone and everything in it. Characters, places, objects, groups, lore, events, story points and themes each get an entry, holding whatever you want to remember about them.",
      "When a name from your World turns up in your text, it's recognized: in Write, hover it to see its entry. Other apps call this a codex or a story bible.",
    ],
    related: ["entry", "mention"],
  },
  {
    id: "entry",
    term: "Entry",
    group: "world",
    body: [
      "One person, place or thing in your World, with its own page: a description, details worth remembering, notes, and the chapters it appears in.",
    ],
    example: "“Mara Quill” is a character entry; “the Brass Key” is an object.",
    related: ["entry-type", "aliases"],
  },
  {
    id: "entry-type",
    term: "Entry type",
    group: "world",
    body: [
      "What kind of thing an entry is: Characters, Locations, Objects, Factions, Lore / Magic / Tech, Events, Story points or Themes. Each type suggests details worth filling in, such as a character's goal. You can add types of your own.",
    ],
    related: ["entry"],
  },
  {
    id: "aliases",
    term: "Aliases",
    aka: ["Other names", "Nickname"],
    group: "world",
    body: [
      "Other names an entry goes by: a nickname, a title, a short form. Your text is checked for these too, so every way you refer to someone is recognized.",
    ],
    example: "Thomas Quill is also “Thomas”, “Da” and “the keeper”.",
    related: ["mention"],
  },
  {
    id: "mention",
    term: "Mention",
    group: "world",
    body: [
      "A place in your text where an entry's name, or one of its aliases, appears. In Write, mentions get a dotted underline: hover one to see the entry, or Ctrl+click it (⌘-click on a Mac) to open its page.",
    ],
    related: ["world", "aliases"],
  },
  {
    id: "faction",
    term: "Faction",
    group: "world",
    body: ["A group with its own aims: a family, a guild, a gang, a government, a church."],
    example: "The Harbor Guild, which Jonas owes money to.",
  },
  {
    id: "lore",
    term: "Lore",
    aka: ["Magic", "Technology", "Worldbuilding"],
    group: "world",
    body: [
      "The rules, history and customs of your story's world: how its magic or technology works, its legends, its traditions. Worth writing down so they stay consistent.",
    ],
    example: "The Lamp Oath, an old promise between the island's lighthouse keepers.",
  },
  {
    id: "event",
    term: "Event",
    group: "world",
    body: [
      "Something that happens in the story's world, often before the book begins or off the page, that the story keeps referring back to.",
    ],
    example: "The night the Night Ferry sank.",
  },
  {
    id: "ai-context",
    term: "AI context",
    group: "world",
    body: [
      "Whether the AI tools may read an entry when they help with your text: always, only when the chapter mentions it, or never. The AI tools are optional, and only run when you ask.",
    ],
  },

  {
    id: "home",
    term: "Home",
    aka: ["Library", "Your books"],
    group: "app",
    body: [
      "The first screen, with all your books. Click one to open it where you left off, or start a new one. Click bookbookbook at the top left to come back here.",
    ],
  },
  {
    id: "plan-page",
    term: "Plan",
    group: "app",
    body: [
      "The page for organizing your book: its acts, its chapters, and what happens in each. Click a chapter to pop out everything planned for it.",
    ],
    related: ["board", "outline"],
  },
  {
    id: "board",
    term: "Board",
    group: "app",
    body: [
      "The Plan laid out as cards, one per chapter, grouped under the act they belong to. Drag the cards to reorder chapters or move them to another act.",
    ],
    related: ["outline"],
  },
  {
    id: "outline",
    term: "Outline",
    group: "app",
    body: [
      "The Plan as a list you read from top to bottom, with each chapter's moments and scenes under it. Good for seeing the whole story at once, and quick to edit from the keyboard.",
    ],
    related: ["board"],
  },
  {
    id: "write-page",
    term: "Write",
    group: "app",
    body: [
      "The page where you write the book's text, one chapter at a time, with the chapter's plan and your World beside it. Everything saves as you type, even offline.",
    ],
  },
  {
    id: "inbox",
    term: "Inbox",
    group: "app",
    body: ["A place to catch ideas the moment they come, typed or spoken, and sort them into chapters later."],
  },
  {
    id: "version",
    term: "Version",
    aka: ["Snapshot", "History"],
    group: "app",
    body: [
      "A saved copy of a scene's text from earlier. Versions are kept automatically as you write, so you can look back, or bring an old one back. You can also save one with a name, like “Before the big rewrite”.",
    ],
  },
  {
    id: "backup",
    term: "Backup",
    group: "app",
    body: [
      "A copy of a whole book in one file, which you can restore if something goes wrong, or open on another computer. Backups can be saved to a folder for you automatically, and you're reminded when it's been a while.",
    ],
    related: ["export"],
  },
  {
    id: "export",
    term: "Export",
    group: "app",
    body: [
      "Saving the book as a file other programs open, such as a Word document or Markdown, laid out as a manuscript.",
    ],
    related: ["manuscript", "backup"],
  },
  {
    id: "import",
    term: "Import",
    group: "app",
    body: [
      "Bringing in a book you've been writing somewhere else, from a Word document, Markdown or plain text. You see where its chapters start, and can change that, before anything is saved.",
    ],
  },
  {
    id: "trash",
    term: "Trash",
    group: "app",
    body: [
      "Where deleted chapters, scenes, entries and books go. They stay there for 30 days, so you can restore them, and are then deleted for good.",
    ],
  },
]

export const termById: ReadonlyMap<string, GlossaryTerm> = new Map(GLOSSARY.map((term) => [term.id, term]))

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Terms matching every word of the query: those whose name or other names match first, then the rest. */
export function searchGlossary(query: string, terms: readonly GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...terms]
  const names: GlossaryTerm[] = []
  const others: GlossaryTerm[] = []
  for (const term of terms) {
    const title = fold([term.term, ...(term.aka ?? [])].join(" "))
    const all = fold([title, ...term.body, ...(term.items ?? []), term.example ?? ""].join(" "))
    if (!words.every((word) => all.includes(word))) continue
    if (words.every((word) => title.includes(word))) names.push(term)
    else others.push(term)
  }
  return [...names, ...others]
}
