/*
 * The glossary (DESIGN.md §17a): every word the app uses that a new writer might not know, in plain English, with an
 * example from the sample book where one helps. Ids are stable: TermHint buttons and tours link to them.
 */

export type GlossaryGroup = "story" | "chapter" | "world" | "app" | "ai"

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
  { id: "ai", title: "AI tools" },
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
    aka: ["Template beat", "Structure beat"],
    group: "story",
    body: [
      "A turning point from a story structure, such as the Catalyst (the event that sets the story going) or the Midpoint (where everything changes).",
      "When your book follows a structure, each chapter can say which of its moments it delivers: choose it in the chapter's pop-out, or click the moment's pin on the structure ribbon. It's a planning aid, not a rule.",
    ],
    example: "Chapter 2 of The Salt Ledger is its Catalyst: Mara finds the ledger, and the mystery begins.",
    related: ["story-structure", "moment", "structure-ribbon"],
  },
  {
    id: "story-structure",
    term: "Story structure",
    aka: ["Beat sheet", "Plot structure", "Save the Cat", "Hero's journey", "Three-act structure"],
    group: "story",
    body: [
      "A map of the shape most stories take: the turning points they pass through, and roughly how far into the book each one comes. Writers use one to check their plot has the parts readers expect, in about the right places.",
      "Choose one for your book from the Structure menu on the Plan, or make your own there. Your chapters can then be marked as its moments, and the ribbon above the Board shows where each one should land.",
    ],
    example:
      "The Salt Ledger follows the 15-beat structure. Its Catalyst, the event that sets the story going, comes in chapter 2, about a tenth of the way in.",
    related: ["structure-moment", "structure-ribbon", "act"],
  },
  {
    id: "premise",
    term: "Premise",
    aka: ["Logline", "Pitch", "Story in a sentence"],
    group: "story",
    body: [
      "Your whole story in one sentence: who it's about, what they want, and what stands in their way. It keeps you on course while you plan, and it's what to say when someone asks what your book is about.",
      "Keep it in Book settings. Plan step by step, in the Structure menu on the Plan, starts from it.",
    ],
    example:
      "“When her lighthouse-keeper father dies, Mara Quill finds a ledger of ships that never existed, and must learn what he was hiding before the Harbor Guild buries it for good.”",
    related: ["synopsis", "story-structure"],
  },
  {
    id: "synopsis",
    term: "Synopsis",
    aka: ["Story summary", "Outline of the story"],
    group: "story",
    body: [
      "The whole story told briefly, from start to finish, ending included: a paragraph or a page, not a teaser. It's a map for you while you write, and agents and publishers often ask for one.",
      "Keep it in Book settings. Plan step by step helps you write one: five sentences for how the story begins, its three disasters, and how it ends.",
    ],
    related: ["premise", "summary"],
  },
  {
    id: "flashback",
    term: "Flashback",
    aka: ["Main story", "Era", "Backstory", "Outside the main timeline"],
    group: "story",
    body: [
      "A part of the story set earlier than the rest, like a memory or a stretch of someone's past. Everything else is the main story.",
      "To mark a chapter as one, give it a story time, tick “Outside the main timeline”, and name it: “flashback”, “1890s”, “the war”. The Timeline then shows it apart from the main story.",
    ],
    related: ["story-time", "timeline"],
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
    id: "tense",
    term: "Tense",
    aka: ["Past tense", "Present tense"],
    group: "story",
    body: [
      "Whether the story is told as if it has already happened, in the past tense, or as it happens, in the present tense. Most novels use the past tense; the present can feel more immediate.",
      "Say which yours uses in Book settings, so the AI tools write in the same tense.",
    ],
    example: "Past: “Mara opened the ledger.” Present: “Mara opens the ledger.”",
    related: ["point-of-view", "style-guide"],
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
    id: "show-dont-tell",
    term: "Show, don't tell",
    aka: ["Showing", "Telling"],
    group: "story",
    body: [
      "Common writing advice: rather than telling readers what a character feels or what something is like, show it through action, detail and dialogue, and let them work it out. Telling is quicker, and fine for what matters less.",
      "Rewrite, in the AI tools, has a Show, don't tell option that tries it on the words you select.",
    ],
    example: "Telling: “Mara was afraid.” Showing: “Mara's hand shook as she turned the key.”",
    related: ["ai-tools"],
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
    related: ["ai-tools", "context"],
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
    id: "search",
    term: "Search",
    aka: ["Command palette", "Commands", "Quick open", "Ctrl+K"],
    group: "app",
    body: [
      "The Search button at the top of every page finds anything in your book by its name: a chapter, a scene, a World entry or a page. Pick one to go straight to it. Ctrl+K (⌘K on a Mac) opens it from anywhere.",
      "It does things for you, too. Type what you want, like “focus mode”, “dark theme” or “export”, and press Enter. It shows the keyboard shortcut for anything that has one, so you can learn them as you go.",
      "To look for words inside what you've written, use Find and replace instead.",
    ],
    example: "Type “ferry” to see every chapter, scene and World entry with ferry in its name.",
    related: ["find-and-replace", "home"],
  },
  {
    id: "plan-page",
    term: "Plan",
    group: "app",
    body: [
      "The page for organizing your book: its acts, its chapters, and what happens in each. Click a chapter to pop out everything planned for it.",
      "It has five views of the same plan: the Board, the Corkboard, the Outline, the Matrix and the Timeline.",
    ],
    related: ["board", "corkboard", "outline", "matrix", "timeline"],
  },
  {
    id: "board",
    term: "Board",
    group: "app",
    body: [
      "The Plan laid out as cards, one per chapter, grouped under the act they belong to. Drag the cards to reorder chapters or move them to another act.",
    ],
    related: ["corkboard", "outline"],
  },
  {
    id: "corkboard",
    term: "Corkboard",
    aka: ["Index cards"],
    group: "app",
    body: [
      "The Plan as index cards, like the ones writers pin to a corkboard: each chapter's title and summary, which you can edit right on the card. Drag a card by the strip along its top to move it, or press Alt and an arrow key there.",
    ],
    related: ["board"],
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
    id: "matrix",
    term: "Matrix",
    aka: ["Grid", "Plot grid"],
    group: "app",
    body: [
      "The Plan as a table, with a column for each chapter and a row for each character and story point in your World. Each square shows whether they're in that chapter, so you can follow one through the book at a glance.",
      "Click a character's square to mark them present, or as the chapter's point of view; a ring means the chapter's text names them but they aren't marked. Click a story point's square to tag the chapter with it. One that goes quiet for three chapters or more is flagged, so it isn't forgotten.",
    ],
    related: ["characters-present", "story-point", "point-of-view"],
  },
  {
    id: "timeline",
    term: "Timeline",
    group: "app",
    body: [
      "The Plan in the order things happen in the story, rather than the order readers meet them. A chapter appears on it once it has a story time.",
      "Switch to reading order to see where the book jumps back or forward in time. Chapters outside the main story, like flashbacks, are shown apart.",
    ],
    related: ["story-time", "flashback"],
  },
  {
    id: "structure-ribbon",
    term: "Structure ribbon",
    group: "app",
    body: [
      "The strip above the Board and the Corkboard showing your book's story structure: a pin for each of its moments, where it should land in the book. Click a pin to see which chapter is marked as that moment, or to mark one.",
      "Hide or show it from the Structure menu.",
    ],
    related: ["story-structure", "structure-moment"],
  },
  {
    id: "write-page",
    term: "Write",
    group: "app",
    body: [
      "The page where you write the book's text, one chapter at a time, with the chapter's plan and your World beside it. Everything saves as you type, even offline.",
    ],
    related: ["find-and-replace", "focus-mode", "daily-goal", "read-aloud"],
  },
  {
    id: "focus-mode",
    term: "Focus mode",
    aka: ["Distraction-free writing", "Zen mode"],
    group: "app",
    body: [
      "A way to write with nothing else on the screen. The menus, the list of chapters and the side panel go, and every paragraph but the one you're writing fades, so your eyes stay on the words.",
      "Start it from the Write page's toolbar, or press Ctrl+. (⌘. on a Mac). Esc, or the same keys, brings everything back.",
    ],
    related: ["typewriter-scrolling", "sprint"],
  },
  {
    id: "typewriter-scrolling",
    term: "Typewriter scrolling",
    group: "app",
    body: [
      "Keeps the line you're writing halfway down the window, the way paper rolls up through a typewriter, instead of letting it creep down to the bottom of the screen. Your eyes can stay in one place as you write.",
      "Turn it on or off from the ⋯ menu on the Write page's toolbar. It's remembered on this device.",
    ],
    related: ["focus-mode"],
  },
  {
    id: "daily-goal",
    term: "Daily goal",
    aka: ["Writing goal", "Words a day"],
    group: "app",
    body: [
      "How many words you'd like to add to a book each day. Set one in Goals and sprints, on the Write page's toolbar, and a bar fills as you write. Each book has its own.",
      "A day's count is the words you added less the ones you cut, so a day of trimming can come out below zero. That's still a day's work.",
    ],
    related: ["streak", "sprint", "word-count-target"],
  },
  {
    id: "streak",
    term: "Streak",
    group: "app",
    body: [
      "How many days running you've met a book's daily goal, shown with today's word count. Today joins the streak once you meet the goal; until then, the streak counts up to yesterday.",
      "Every day is measured against the goal you have now, so raising it can shorten the streak. If you'd rather not see it, turn off Show my streak in Goals and sprints.",
    ],
    related: ["daily-goal"],
  },
  {
    id: "sprint",
    term: "Sprint",
    aka: ["Writing sprint", "Word sprint", "Timer"],
    group: "app",
    body: [
      "A short, set time to write in, with a clock counting down. When it ends, you see how many words you added. Racing the clock helps you keep going instead of polishing every sentence as you write it.",
      "Start one from Goals and sprints on the Write page's toolbar: 15, 25 or 45 minutes, or a length of your own up to four hours. One runs at a time, and if you stop it early, its words still count toward the day.",
    ],
    related: ["daily-goal", "focus-mode"],
  },
  {
    id: "find-and-replace",
    term: "Find and replace",
    aka: ["Find", "Search", "Replace"],
    group: "app",
    body: [
      "Searching the whole book for a word, a phrase or a name, and changing it if you like. Open Find on the Write page's toolbar, or select some words and press Ctrl+Shift+F (⌘⇧F on a Mac) to search for them.",
      "Enter goes to the next match, and Shift+Enter to the one before. Replace changes the match you're on, and Replace all changes every one in the book at once. Replace all keeps a version of each scene it changes first, and can be undone.",
    ],
    items: [
      "Match case: “Bell” finds Bell, but not bell.",
      "Whole words: “key” finds key, but not keeper.",
      "Pattern: searches for kinds of text rather than exact words.",
    ],
    example: "Find “paraffin” and replace it with “kerosene” to change what the lamps burn, everywhere at once.",
    related: ["pattern", "version"],
  },
  {
    id: "pattern",
    term: "Pattern",
    aka: ["Regular expression", "Regex"],
    group: "app",
    body: [
      "A way to search for kinds of text rather than exact words, written in a code called regular expressions. Turn on Pattern in Find to use one; most searches never need it. A few of its symbols:",
    ],
    items: [
      ". stands for any one character.",
      "? makes what's just before it optional: colou?r finds color and colour.",
      "| means or: Mara|Jonas finds either name.",
      "\\d stands for any digit, and \\d+ for a whole number.",
      "( ) make a group, and $1 in Replace with puts back what the first group found.",
    ],
    example: "ledgers? finds both “ledger” and “ledgers”.",
    related: ["find-and-replace"],
  },
  {
    id: "read-aloud",
    term: "Read aloud",
    aka: ["Text to speech", "Speech"],
    group: "app",
    body: [
      "Hearing your words read back in one of your device's voices, a sentence at a time, with each sentence marked as it's spoken. Ears catch clumsy rhythms, repeated words and missing ones that eyes skim over.",
      "Start it from the ⋯ menu on the Write page's toolbar. It reads on from the sentence your cursor is in, or just the words you've selected. A bar at the bottom lets you pause, skip a sentence, and choose the voice and speed.",
      "Esc, or Stop reading, ends it and leaves your cursor on the sentence it reached, so you can fix what you heard. Typing ends it too.",
    ],
  },
  {
    id: "add-to-world",
    term: "Add to World",
    aka: ["Quick-create", "New entry"],
    group: "app",
    body: [
      "Making a World entry for a name without leaving your text. Select a name that isn't in your World yet and click Add to World over it, or choose Add to World… from the ⋯ menu. Then pick what kind of thing it is, such as a character or a place, and add any other names it goes by.",
      "From then on, the name is underlined wherever it appears, like every other entry.",
    ],
    related: ["world", "entry", "aliases", "mention"],
  },
  {
    id: "inbox",
    term: "Inbox",
    aka: ["Quick note", "Capture"],
    group: "app",
    body: [
      "A place to catch ideas the moment they come, typed or spoken, and sort them into your book later. Each book has its own Inbox.",
      "New notes wait in To sort until you file them into a chapter or a World entry. Then they move to Filed, which says where each one went. Quick note, at the top of every page in a book, adds a note without leaving what you're doing.",
    ],
    example:
      "“What if the last page of the ledger is in Thomas's hand, not their father's?” waits in To sort until it's clear which chapter it belongs in.",
    related: ["filing", "dictation"],
  },
  {
    id: "filing",
    term: "Filing a note",
    aka: ["File", "Filed", "To sort"],
    group: "app",
    body: [
      "Putting a note from the Inbox where it belongs: into a chapter's plan, as moments, as notes or as more of its summary, or into the notes of a World entry. Filed as moments, each line of the note becomes a moment. Add to World makes a note into a new entry instead.",
      "A filed note moves from To sort to Filed, which says where it went and takes you there. Changed your mind? Move back to To sort returns the note to the list, and what was filed stays where it went.",
    ],
    example:
      "“Jonas hums the same three bars of a shanty whenever he lies” could go into Jonas Quill's notes in your World, or be a moment in Chapter 1, The Ferry Home.",
    related: ["inbox", "moment", "notes"],
  },
  {
    id: "dictation",
    term: "Dictation",
    aka: ["Dictate", "Speech to text", "Voice typing"],
    group: "app",
    body: [
      "Saying your words out loud and having them typed for you. Click Dictate, on the Write page's toolbar, in the Inbox or in Quick note, and speak. What you say shows at the bottom of the screen as it's heard, and is typed a moment later.",
      "The first time, you choose the language you'll speak, and where your speech is turned into text: on this device, or online. To stop, click Stop or Dictate, or say “stop listening”.",
      "On a phone or tablet, the microphone key on the keyboard works anywhere you can type, too.",
    ],
    related: ["voice-commands", "on-device", "inbox"],
  },
  {
    id: "voice-commands",
    term: "Voice commands",
    group: "app",
    body: [
      "Words that do something when you dictate, instead of being typed. They're English words, so they work when you speak English. Turn them off in Dictation settings to have everything typed just as you say it.",
    ],
    items: [
      "“Period”, “comma”, “question mark”, “exclamation mark”, “colon” and “semicolon” type the mark.",
      "“Open quote” and “close quote” type “ and ”.",
      "“New line” and “new paragraph” start one.",
      "“New moment”, in a note, starts a new line. File the note as moments, and each line becomes one.",
      "“Scratch that” takes back what you said last.",
      "“Literal” before a command types its words instead: “literal comma” types “comma”.",
      "“Stop listening” stops dictation.",
    ],
    example: "“The bell rang comma twice period new paragraph” types “The bell rang, twice.” and starts a new paragraph.",
    related: ["dictation"],
  },
  {
    id: "on-device",
    term: "On this device or online",
    aka: ["On-device", "Online", "Speech recognition"],
    group: "app",
    body: [
      "Where your speech is turned into text when you dictate. On this device, the browser does it by itself: your voice never leaves your computer or phone, and it works without the internet. Some languages need a one-time download first.",
      "Online, the sound of your voice goes to your browser's speech service, such as Google's or Apple's, while the microphone is on, and the text comes back. It needs the internet, but works in more browsers.",
      "Either way, only the words are kept, never a recording. Change it in Dictation settings, in the ⋯ menu on the Write page or beside Dictate in the Inbox.",
    ],
    related: ["dictation"],
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

  {
    id: "ai-tools",
    term: "AI tools",
    aka: ["AI", "Artificial intelligence", "AI assistant"],
    group: "ai",
    body: [
      "Optional helpers that write with you when you ask. Open AI tools on the Write page's toolbar, pick a tool and run it: an AI model reads part of your book and comes back with text or ideas on a card. Nothing goes into your book until you choose Insert or Replace.",
      "Connect them once, in AI settings: to an AI company, with your own key, or to a model running on this computer. Nothing is sent anywhere until you run a tool.",
    ],
    items: [
      "Continue writes what could come next, from your cursor. Ctrl+J (⌘J on a Mac) runs it from your text.",
      "Draft from moments drafts the next stretch of the chapter from its moments.",
      "Describe gives ideas for describing something, sense by sense.",
      "Rewrite gives three new versions of the words you select: more vivid, shorter, or as you ask.",
      "Expand and Condense make a passage longer and richer, or about half as long.",
      "Dialogue polish makes what characters say sound more like them.",
      "Chapter feedback gives an editor's notes on the chapter.",
      "Brainstorm gives ten ideas: twists, characters, titles and more.",
      "Name generator gives names that fit your world and don't clash with the ones you have.",
      "Summarize chapter writes a summary and lists the chapter's moments, for your plan.",
    ],
    related: ["model", "api-key", "context", "ai-written", "custom-tool"],
  },
  {
    id: "model",
    term: "Model",
    aka: ["AI model", "Language model", "LLM"],
    group: "ai",
    body: [
      "The AI program that does the writing, trained on huge amounts of text to carry on from what it's given. Each AI company offers several: bigger models write better and cost more, while smaller ones are quicker and cheaper.",
      "AI settings suggests a model for each company, and Check connection lists the ones you can use.",
    ],
    related: ["api-key", "local-model", "token"],
  },
  {
    id: "api-key",
    term: "API key",
    aka: ["Key", "Your own key", "BYOK"],
    group: "ai",
    body: [
      "A long, password-like code from an AI company, such as OpenAI, Anthropic or OpenRouter, that lets bookbookbook use its models on your account. You make one on the company's website, and it bills you for what you use, usually a fraction of a cent a run.",
      "Paste it into AI settings. It's kept in this browser, on this device, and only ever sent to that company. Anyone with the key can spend from your account, so keep it to yourself.",
    ],
    related: ["model", "local-model"],
  },
  {
    id: "local-model",
    term: "Local model",
    aka: ["On this computer", "Ollama", "LM Studio"],
    group: "ai",
    body: [
      "An AI model that runs on your own computer, in a free program such as Ollama or LM Studio, rather than on a company's servers. It costs nothing to use and your book never leaves the computer, but it needs a powerful machine, and its writing is usually weaker than the big companies' models.",
      "Install the program and download a model in it. Then choose On this computer in AI settings, which shows the setting each program needs to let bookbookbook in.",
    ],
    related: ["model", "api-key"],
  },
  {
    id: "token",
    term: "Token",
    aka: ["Tokens"],
    group: "ai",
    body: [
      "The pieces AI models read and write text in: a short word, or part of a longer one. A token is about three quarters of a word, so 1,000 tokens is about 750 words.",
      "Models can read only so many tokens at once, and AI companies charge by the token. How much it can read, in AI settings, sets the most a tool sends; when your book is longer, it leaves out the parts that matter least.",
    ],
    related: ["context", "model"],
  },
  {
    id: "context",
    term: "Context",
    aka: ["What the AI sees", "Prompt", "Context window"],
    group: "ai",
    body: [
      "Everything a tool sends the AI with its request: the text around your cursor, the chapter's plan, the World entries it mentions, your book's style and more. The AI knows only what's in it, so the more it has, the better its answers fit your book.",
      "What the AI sees, in the AI tools panel, lists each part and its size. Untick a part to leave it out, and open The whole prompt to read exactly what will be sent.",
    ],
    related: ["token", "ai-context", "style-guide"],
  },
  {
    id: "ai-written",
    term: "AI-written",
    aka: ["AI tint", "AI share", "Provenance"],
    group: "ai",
    body: [
      "Text from the AI tools is tinted in your book, so you can tell it from your own words. Edit it, and the words you change become yours and lose the tint.",
      "The AI tools panel shows how much of the chapter and of the book is still AI-written. AI settings can hide the tint, though the text still counts. Exports never show it.",
    ],
    related: ["ai-tools"],
  },
  {
    id: "custom-tool",
    term: "Your own tools",
    aka: ["Custom tool", "Prompt template"],
    group: "ai",
    body: [
      "AI tools you make yourself, by writing what to ask the AI in your own words. Words in braces are filled in as it runs: {selection} becomes the text you selected, {moments} the chapter's moments, and so on.",
      "Make them with Your own tools, at the top of the AI tools panel. They're kept on this device, for all your books.",
    ],
    example: "Rewrite {selection} the way Mara would say it: short, dry and a little sad.",
    related: ["ai-tools", "context"],
  },
  {
    id: "style-guide",
    term: "Style guide",
    group: "ai",
    body: [
      "Your rules for how the book is written, in a few lines: sentence length, spelling, words to avoid, how dialogue is tagged. The AI tools follow it, with the point of view, tense and sample passages, all in Book settings.",
    ],
    example: "Short sentences. No adverbs in dialogue tags. British spelling.",
    related: ["tense", "point-of-view", "context"],
  },
]

export const termById: ReadonlyMap<string, GlossaryTerm> = new Map(GLOSSARY.map((term) => [term.id, term]))

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/**
 * Terms matching every word of the query: those whose name or other names have the words in that order first, then
 * those whose names have them in any order, then the rest.
 */
export function searchGlossary(query: string, terms: readonly GlossaryTerm[] = GLOSSARY): GlossaryTerm[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...terms]
  const phrase = words.join(" ")
  const exact: GlossaryTerm[] = []
  const names: GlossaryTerm[] = []
  const others: GlossaryTerm[] = []
  for (const term of terms) {
    const title = fold([term.term, ...(term.aka ?? [])].join(" "))
    const all = fold([title, ...term.body, ...(term.items ?? []), term.example ?? ""].join(" "))
    if (!words.every((word) => all.includes(word))) continue
    if (title.includes(phrase)) exact.push(term)
    else if (words.every((word) => title.includes(word))) names.push(term)
    else others.push(term)
  }
  return [...exact, ...names, ...others]
}
