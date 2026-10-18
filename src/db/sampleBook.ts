import type { CodexTypeKey } from "./codexTypes"

/*
 * The sample book from the prototype (prototype/data.js), seeded on first run so the app opens on a real outline:
 * twelve chapters in three acts, with prose in the first four. Plot threads, events and the theme are codex entries
 * like the characters; prose mentions of them aren't tracked (see NO_AUTO_MENTION_TYPES).
 */

export interface SampleScene {
  title: string
  pov: string
  prose: string[]
}

export interface SampleChapter {
  act: number
  title: string
  status: "idea" | "outlined" | "drafting" | "revising" | "done"
  summary: string
  pov: string
  /** A SAMPLE_CODEX key, or "" for nowhere in the codex. */
  place: string
  /** Free text, stored as a story time (see storyTimeFromText). */
  time: string
  /** A moment key from the 15-beat structure, or "". */
  beat: string
  target: number
  labels: string[]
  notes?: string
  beats: [text: string, done: boolean][]
  /** Plot thread keys. */
  threads: string[]
  /** Characters present. */
  present: string[]
  scenes: SampleScene[]
}

export interface SampleEntry {
  key: string
  type: CodexTypeKey
  name: string
  aliases: string[]
  tags: string[]
  aiContext: "always" | "mentioned" | "never"
  color: string
  fields: Record<string, string>
  notes: string
}

export const SAMPLE_BOOK = {
  universe: "Grayhaven",
  title: "The Salt Ledger",
  genre: "Literary mystery",
  pov: "third_limited",
  tense: "past",
  audience: "adult",
  targetWords: 90_000,
  templateKey: "fifteen_beat",
}

export const SAMPLE_ACTS = ["ACT I — Arrival", "ACT II — The Ledger", "ACT III — The Light"]

export const SAMPLE_CHAPTERS: SampleChapter[] = [
  {
    act: 0,
    title: "The Ferry Home",
    status: "done",
    summary:
      "Mara Quill returns to Grayhaven for Thomas's funeral and finds the island smaller, sharper, and less willing to forgive absence.",
    pov: "mara",
    place: "northQuay",
    time: "Day 1 morning",
    beat: "opening_image",
    target: 3000,
    labels: ["return", "grief"],
    threads: ["mystery", "grief"],
    present: ["mara", "jonas", "elias"],
    beats: [
      ["Mara steps off the ferry", true],
      ["Jonas dodges the Harbor Guild", true],
      ["Elias offers help she refuses", true],
    ],
    scenes: [
      {
        title: "Ferry wake",
        pov: "mara",
        prose: [
          "The ferry nosed through Grayhaven's harbor with the tired certainty of an animal returning to its stall. Mara Quill stood at the rail and watched North Quay rise from the mist: gulls worried the pilings, ropes knocked their wooden complaints against masts, and every roof wore the same pewter sheen of salt.",
          "Jonas waited below the crane with his cap pulled low. He had their father's shoulders and none of Thomas's stillness; even standing still, Jonas looked as if he were bargaining with the weather. When Mara embraced him, he smelled of herring, tobacco, and a fear he tried to make into a joke.",
          "Elias Penhallow crossed the quay after the coffin wagon had gone. Twelve years had put silver at his temples and care at the corners of his eyes. \"I'm sorry about Thomas,\" he said, gentle as a hand offered across ice. Mara thanked him like a stranger and looked past him toward the road to the lighthouse.",
          "Grayhaven Light sat above the town with its lantern dark at noon. Her father had kept it burning for thirty-seven winters. Now the windows stared down blankly, and Mara felt the old map inside her redraw itself around an absence.",
        ],
      },
    ],
  },
  {
    act: 0,
    title: "The Keeper's Room",
    status: "revising",
    summary:
      "In Thomas's locked room Mara finds a salt-stained ledger listing impossible ships and a brass key hidden in the spine of an old tide table.",
    pov: "mara",
    place: "light",
    time: "Day 1 night",
    beat: "catalyst",
    target: 3000,
    labels: ["ledger", "father"],
    threads: ["mystery", "grief"],
    present: ["mara", "thomas", "agnes"],
    notes: "Thomas's absence should feel physically organized here.",
    beats: [
      ["Unlock the keeper's room", true],
      ["Find the Salt Ledger", true],
      ["Notice ships that never existed", false],
      ["Pocket the brass key", false],
    ],
    scenes: [
      {
        title: "The locked room",
        pov: "mara",
        prose: [
          "The keeper's room had kept his shape. Thomas Quill's chair faced the western glass; his mug sat ringed with old tea; a wool cardigan hung from the peg as though his arms had only just slipped free. Mara touched nothing at first. A room could be a tide pool after grief, full of small lives that died if handled too soon.",
          "Behind the tide tables she found the Salt Ledger. Its cover had gone white along the edges, stiffened by brine. Inside, her father's hand marched down the pages in careful columns: dates, tides, names of vessels, lantern signals. The names made no sense. The Mercy Star had never called at Grayhaven. The blue-hulled Aster did not exist on any chart Mara had drawn.",
          "On the last page, Thomas had written only: Ask Agnes what we inherited.",
        ],
      },
      {
        title: "A key in the spine",
        pov: "mara",
        prose: [
          "The brass key dropped from the cracked spine of the tide table and struck the floor with a sound too bright for the dead room. Mara knelt, suddenly angry with herself for flinching. Her father had hidden things in plain sight all her life: sweets in flour tins, money under a loose stair, tenderness inside rules.",
          "She held the key up to the lantern. Green had gathered in the teeth. Around the bow someone had etched three strokes, then a circle: the Lamp Oath mark, older than the lighthouse and almost forgotten.",
          "By midnight the wind had pushed rain against the glass. Mara copied the impossible ship names into her notebook, precise and wry even in panic, and felt the first clean edge of a mystery cut through mourning.",
        ],
      },
    ],
  },
  {
    act: 0,
    title: "The Drowned Bell",
    status: "drafting",
    summary:
      "At the Drowned Bell, Mara tests the ledger against island memory while Jonas's debts surface and Elias offers a dangerous partnership.",
    pov: "mara",
    place: "bell",
    time: "Day 2 evening",
    beat: "debate",
    target: 3000,
    labels: ["pub", "choice"],
    threads: ["mystery", "romance", "debts"],
    present: ["mara", "jonas", "elias", "agnes"],
    notes: "Keep pub warmth against pressure.",
    beats: [
      ["Ask Agnes about the impossible ships", true],
      ["See Guild pressure on Jonas", false],
      ["Elias recognizes a Night Ferry pattern", false],
      ["Mara chooses whether to stay", false],
    ],
    scenes: [
      {
        title: "Pub light",
        pov: "mara",
        prose: [
          "The Drowned Bell had been built from a wreck and never stopped admitting it. Its beams curved like ribs above the taproom; storm lanterns swung from old hooks; their glass was smoky and warm, making every face seem borrowed from another century.",
          "Mara found Agnes Morrow in the corner beneath the bell rope, a woman folded into black wool and attention. \"Your father was a careful liar,\" Agnes said before Mara could sit. \"The best kind. Their are lies that save a life, and lies that buy one more winter.\"",
          "For a moment the room seemed to tilt toward the ledger in Mara's satchel: brass gone green at the seams, the smell of paraffin and salt, each inked ship a door cut into weather.",
        ],
      },
      {
        title: "Elias's offer",
        pov: "mara",
        prose: [
          "Jonas laughed too loudly at the bar, just a little, and Mara saw the Harbor Guild men stop pretending not to watch him. One of them tapped two fingers on the counter. Jonas's smile held, then very quickly did not.",
          "Elias slid into the chair opposite Mara with two cups of tea he had somehow rescued from the ale and smoke. \"If Thomas wrote the Night Ferry into those pages,\" he said, carefully, \"then he wasn't keeping accounts. He was keeping witnesses.\"",
          "Mara looked at his hands, at the old rope scar across one knuckle. She noticed how easily Grayhaven made a person fourteen again, really, just by bringing back the right voice in the right bad light. \"And what do you want for helping me?\" she asked. Elias smiled without victory. \"To know why my father is afraid of a dead lighthouse keeper.\"",
        ],
      },
    ],
  },
  {
    act: 0,
    title: "Low Tide",
    status: "drafting",
    summary:
      "Jonas tries to settle a debt before Mara learns its shape, but the tide gives up one more secret from Thomas's last night.",
    pov: "jonas",
    place: "northQuay",
    time: "Day 3 dawn",
    beat: "break_into_two",
    target: 2500,
    labels: ["debts"],
    threads: ["debts", "mystery"],
    present: ["jonas", "mara"],
    beats: [
      ["Jonas meets the Guild collector", false],
      ["Mara follows him to the quay", false],
      ["A buoy tag matches the ledger", false],
    ],
    scenes: [
      {
        title: "Mud and rope",
        pov: "jonas",
        prose: [
          "At low tide North Quay smelled like coins held too long in a fist. Jonas Quill crossed the mud flats before sunrise, boots sucking at the black shine, and told himself he was not afraid of men who wore clean gloves to dirty work.",
          "The Guild collector waited beside the net sheds. \"Your father's debts did not drown with him,\" he said. Jonas laughed because laughing was cheaper than courage. Then Mara called his name from the quay wall, and the morning went thin as paper.",
        ],
      },
    ],
  },
  {
    act: 1,
    title: "The Archive",
    status: "outlined",
    summary: "Mara and Elias search the Archive and learn the Night Ferry passenger list was altered.",
    pov: "mara",
    place: "archive",
    time: "Day 4 morning",
    beat: "b_story",
    target: 3000,
    labels: ["research"],
    threads: ["mystery", "romance"],
    present: ["mara", "elias", "agnes"],
    beats: [
      ["Agnes opens the restricted shelf", false],
      ["Elias finds a missing witness", false],
      ["Mara admits she may stay", false],
    ],
    scenes: [],
  },
  {
    act: 1,
    title: "Storm Warning",
    status: "outlined",
    summary: "A storm traps Mara in the lighthouse where Thomas's marginalia seem to answer the weather.",
    pov: "mara",
    place: "light",
    time: "Day 4 night",
    beat: "fun_and_games",
    target: 3000,
    labels: ["storm"],
    threads: ["mystery", "grief"],
    present: ["mara", "thomas"],
    beats: [
      ["Storm cuts power", false],
      ["Lamp Oath mark appears", false],
      ["Mara decodes a signal", false],
    ],
    scenes: [],
  },
  {
    act: 1,
    title: "What Jonas Owes",
    status: "outlined",
    summary: "Jonas reveals his debt began as a favor for Thomas and has become leverage against the Quills.",
    pov: "jonas",
    place: "bell",
    time: "Day 4 night",
    beat: "",
    target: 2500,
    labels: ["debts"],
    threads: ["debts"],
    present: ["jonas", "elias"],
    beats: [
      ["Guild demand", false],
      ["Jonas protects Mara", false],
      ["Elias overhears", false],
    ],
    scenes: [],
  },
  {
    act: 1,
    title: "The Brass Key",
    status: "outlined",
    summary: "The brass key opens a sealed lamp-room drawer and turns the ledger from mystery to accusation.",
    pov: "mara",
    place: "light",
    time: "Day 5",
    beat: "midpoint",
    target: 3000,
    labels: ["key"],
    threads: ["mystery", "romance"],
    present: ["mara", "elias"],
    beats: [
      ["Key opens drawer", false],
      ["Hidden chart found", false],
      ["Mara and Elias choose trust", false],
    ],
    scenes: [],
  },
  {
    act: 1,
    title: "The Night Ferry",
    status: "idea",
    summary: "Thomas witnesses the Night Ferry disaster and makes the oath that will cost him his peace.",
    pov: "thomas",
    place: "",
    time: "12 years earlier",
    beat: "",
    target: 2800,
    labels: ["flashback"],
    notes: "At sea, twelve years before the book opens.",
    threads: ["mystery", "grief"],
    present: ["thomas", "agnes"],
    beats: [
      ["Ferry disappears", false],
      ["Thomas saves one child", false],
      ["Oath sworn", false],
    ],
    scenes: [],
  },
  {
    act: 2,
    title: "All Hands",
    status: "idea",
    summary: "The Guild corners Jonas and Mara loses the ledger just as a second storm approaches.",
    pov: "mara",
    place: "northQuay",
    time: "Day 7",
    beat: "all_is_lost",
    target: 3000,
    labels: ["crisis"],
    threads: ["mystery", "debts"],
    present: ["mara", "jonas", "elias"],
    beats: [
      ["Guild takes ledger", false],
      ["Jonas confesses", false],
      ["Mara loses Elias's trust", false],
    ],
    scenes: [],
  },
  {
    act: 2,
    title: "The Lamp Oath",
    status: "idea",
    summary:
      "Mara relights the oath signal and gathers the living witnesses before the Harbor Guild can bury the truth.",
    pov: "mara",
    place: "light",
    time: "Day 8 night",
    beat: "finale",
    target: 3200,
    labels: ["finale"],
    threads: ["mystery", "romance", "grief"],
    present: ["mara", "elias", "agnes"],
    beats: [
      ["Signal lit", false],
      ["Witnesses gather", false],
      ["Guild exposed", false],
    ],
    scenes: [],
  },
  {
    act: 2,
    title: "Final Light",
    status: "idea",
    summary: "Grayhaven changes hands quietly, and Mara decides what inheritance is worth keeping.",
    pov: "mara",
    place: "grayhaven",
    time: "Day 9",
    beat: "final_image",
    target: 2400,
    labels: ["resolution"],
    threads: ["romance", "grief"],
    present: ["mara", "jonas", "elias"],
    beats: [
      ["Funeral bell repaired", false],
      ["Mara maps a new harbor", false],
      ["Final light burns", false],
    ],
    scenes: [],
  },
]

export const SAMPLE_CODEX: SampleEntry[] = [
  {
    key: "mara",
    type: "characters",
    name: "Mara Quill",
    aliases: ["Mara", "Quill", "Mar"],
    tags: ["protagonist", "cartographer"],
    aiContext: "always",
    color: "#6B7FA6",
    fields: {
      Role: "Cartographer returning home",
      Age: "29",
      Appearance: "Wind-browned, ink on cuffs",
      Personality: "Precise, wry, wary of sentiment",
      Goal: "Decode Thomas's ledger",
      "Wound / fear": "Left Grayhaven after the Night Ferry",
      "Voice & speech": 'Precise, wry, understated. Sample: "Maps don\'t lie; people ask them to."',
    },
    notes: "Mara reads landscapes before faces. She wants grief to behave like a chart.",
  },
  {
    key: "jonas",
    type: "characters",
    name: "Jonas Quill",
    aliases: ["Jonas", "Jon"],
    tags: ["brother", "debts"],
    aiContext: "mentioned",
    color: "#C98A2B",
    fields: {
      Role: "Fisherman and Mara's brother",
      Age: "34",
      Appearance: "Broad-shouldered, tired smile",
      Personality: "Blunt, protective, evasive",
      Goal: "Keep the Guild away from Mara",
      "Wound / fear": "Believes he failed Thomas",
      "Voice & speech": 'Blunt, short sentences, jokes as deflection. Sample: "Bad tide. Worse company."',
    },
    notes: "Jonas owes the Harbor Guild for a debt tied to Thomas's final year.",
  },
  {
    key: "elias",
    type: "characters",
    name: "Elias Penhallow",
    aliases: ["Elias", "Eli", "Penhallow"],
    tags: ["old flame"],
    aiContext: "mentioned",
    color: "#C2557A",
    fields: {
      Role: "Harbor master's son",
      Age: "31",
      Appearance: "Careful hands, silver at temples",
      Personality: "Warm, careful, patient",
      Goal: "Understand his father's fear",
      "Wound / fear": "Chose family duty over Mara",
      "Voice & speech":
        'Warm, careful, asks questions. Sample: "What would make Thomas hide truth where only you could find it?"',
    },
    notes: "Elias is implicated by family name but drawn toward truth and Mara.",
  },
  {
    key: "agnes",
    type: "characters",
    name: "Agnes Morrow",
    aliases: ["Agnes", "Mrs. Morrow"],
    tags: ["archivist"],
    aiContext: "always",
    color: "#3F7D58",
    fields: {
      Role: "Archivist",
      Age: "74",
      Appearance: "Black wool, bright eyes",
      Personality: "Unsparing, loyal to records",
      Goal: "Make old witnesses speak",
      "Voice & speech": "Dry, exacting, old-island cadence",
    },
    notes: "Agnes remembers the Night Ferry and Thomas's oath.",
  },
  {
    key: "thomas",
    type: "characters",
    name: "Thomas Quill",
    aliases: ["Thomas", "Da", "the keeper"],
    tags: ["deceased"],
    aiContext: "mentioned",
    color: "#7A7366",
    fields: {
      Role: "Last lighthouse keeper",
      Age: "Deceased",
      Appearance: "Absent shape in rooms",
      Personality: "Patient, secretive, morally stubborn",
      Goal: "Protect the Night Ferry truth",
      "Voice & speech": "Sparse, practical, kind through action",
    },
    notes: "Thomas encoded impossible ships in the Salt Ledger.",
  },
  {
    key: "grayhaven",
    type: "locations",
    name: "Grayhaven",
    aliases: ["the island"],
    tags: ["island"],
    aiContext: "mentioned",
    color: "#2A8C8C",
    fields: {
      Atmosphere: "Cold, salt-bright, observant",
      Senses: "Kelp, coal smoke, gulls, wet rope",
      History: "Built around light, ferry, and Guild",
    },
    notes: "The town behaves like a chorus.",
  },
  {
    key: "light",
    type: "locations",
    name: "the Lighthouse",
    aliases: ["Grayhaven Light", "lighthouse"],
    tags: ["setting"],
    aiContext: "always",
    color: "#2E4A7D",
    fields: {
      Atmosphere: "High, drafty, watchful",
      Senses: "Paraffin, brass, salt, glass",
      History: "Kept by the Quills for generations",
    },
    notes: "Lamp room holds Thomas's hidden drawer.",
  },
  {
    key: "bell",
    type: "locations",
    name: "the Drowned Bell",
    aliases: ["Drowned Bell"],
    tags: ["pub"],
    aiContext: "mentioned",
    color: "#8A63B8",
    fields: {
      Atmosphere: "Warm wreckage",
      Senses: "Ale, smoke, swinging lanterns",
      History: "Built from timbers of a wreck",
    },
    notes: "A public room where private debts surface.",
  },
  {
    key: "northQuay",
    type: "locations",
    name: "North Quay",
    aliases: ["the quay", "quay wall"],
    tags: ["harbor"],
    aiContext: "mentioned",
    color: "#2A8C8C",
    fields: {
      Atmosphere: "Exposed, work-worn, full of watchers",
      Senses: "Tarred rope, fish scales, crane chains, diesel",
      History: "The island's practical front door and the Guild's favorite stage",
    },
    notes: "North Quay is where public arrivals, bargains, and threats happen in plain sight.",
  },
  {
    key: "archive",
    type: "locations",
    name: "the Archive",
    aliases: ["Archive", "restricted shelf"],
    tags: ["records"],
    aiContext: "mentioned",
    color: "#3F7D58",
    fields: {
      Atmosphere: "Dry, lamp-lit, reverent without being gentle",
      Senses: "Dust, paste, wool gloves, rain against high windows",
      History: "Agnes keeps ferry logs, oath books, and the altered passenger list here",
    },
    notes: "The Archive turns memory into evidence and gives Agnes tactical power.",
  },
  {
    key: "ledger",
    type: "objects",
    name: "the Salt Ledger",
    aliases: ["the ledger", "Salt Ledger"],
    tags: ["mystery"],
    aiContext: "always",
    color: "#2A8C8C",
    fields: {
      Description: "Salt-stiff book of impossible ships",
      Owner: "Thomas Quill",
      Secret: "A witness register in code",
    },
    notes: "The main clue engine.",
  },
  {
    key: "key",
    type: "objects",
    name: "the Brass Key",
    aliases: ["brass key"],
    tags: ["clue"],
    aiContext: "mentioned",
    color: "#C98A2B",
    fields: { Description: "Green at the teeth, Lamp Oath mark", Owner: "Thomas Quill", Secret: "Opens the lamp-room drawer" },
    notes: "Hidden in a tide table spine.",
  },
  {
    key: "guild",
    type: "factions",
    name: "the Harbor Guild",
    aliases: ["Guild", "Harbor Guild"],
    tags: ["antagonist"],
    aiContext: "mentioned",
    color: "#C98A2B",
    fields: {
      Power: "Controls berths and debts",
      "Public face": "Order and safety",
      Secret: "Profited from the Night Ferry silence",
    },
    notes: "Uses debt as weather: constant pressure.",
  },
  {
    key: "oath",
    type: "lore",
    name: "the Lamp Oath",
    aliases: ["Lamp Oath"],
    tags: ["tradition"],
    aiContext: "mentioned",
    color: "#6B7FA6",
    fields: {
      Meaning: "A keeper's promise to witness at any cost",
      Symbol: "Three strokes and a circle",
    },
    notes: "A moral inheritance, not just ritual.",
  },
  {
    key: "mystery",
    type: "plot_threads",
    name: "Ledger mystery",
    aliases: ["ledger mystery"],
    tags: ["main plot"],
    aiContext: "always",
    color: "#2A8C8C",
    fields: {
      Question: "What ships never existed, and why did Thomas record them?",
      Stakes: "The island's story of the Night Ferry, and who profited from it",
    },
    notes: "Runs through every act.",
  },
  {
    key: "romance",
    type: "plot_threads",
    name: "Mara & Elias",
    aliases: ["old flame", "Mara and Elias"],
    tags: ["romance"],
    aiContext: "mentioned",
    color: "#C2557A",
    fields: {
      Question: "Can old trust become action instead of nostalgia?",
      Stakes: "A second chance, and whose family pays for the truth",
    },
    notes: "The romance advances when they choose evidence over self-protection.",
  },
  {
    key: "debts",
    type: "plot_threads",
    name: "Jonas's debts",
    aliases: ["Jonas debt", "Guild debt"],
    tags: ["subplot"],
    aiContext: "mentioned",
    color: "#C98A2B",
    fields: {
      Question: "What did Jonas promise the Guild, and for whom?",
      Stakes: "Jonas's boat, and his place beside Mara",
    },
    notes: "This thread should go quiet long enough to feel dangerous, then surface hard.",
  },
  {
    key: "grief",
    type: "plot_threads",
    name: "Grief",
    aliases: ["mourning"],
    tags: ["inner arc"],
    aiContext: "mentioned",
    color: "#6B7FA6",
    fields: {
      Question: "What do we owe the dead?",
      Stakes: "Whether Mara can stay on the island",
    },
    notes: "Grief changes from map to weather.",
  },
  {
    key: "nightFerry",
    type: "events",
    name: "The Night Ferry sinks",
    aliases: ["Night Ferry", "Night Ferry disaster"],
    tags: ["backstory"],
    aiContext: "always",
    color: "#2E4A7D",
    fields: { When: "12 years earlier", Where: "At sea", Consequences: "Witnesses hidden in ledger" },
    notes: "The buried history under the novel.",
  },
  {
    key: "drowning",
    type: "events",
    name: "Thomas drowns",
    aliases: ["Thomas's drowning", "Thomas drowns"],
    tags: ["inciting"],
    aiContext: "always",
    color: "#7A7366",
    fields: {
      When: "Three days before Chapter 1",
      Where: "Below Grayhaven Light",
      Consequences: "Mara returns and Jonas inherits pressure from the Guild",
    },
    notes: "The inciting absence. It should feel like a question before it feels like an answer.",
  },
  {
    key: "storm",
    type: "events",
    name: "The Storm",
    aliases: ["storm", "Day 4 storm"],
    tags: ["set piece"],
    aiContext: "mentioned",
    color: "#C98A2B",
    fields: {
      When: "Day 4 night",
      Where: "Grayhaven and the lighthouse",
      Consequences: "Traps Mara in the tower and exposes Thomas's signal code",
    },
    notes: "Parallel pressure point for Ch 6 and Ch 7.",
  },
  {
    key: "inheritance",
    type: "themes",
    name: "What we inherit",
    aliases: ["inheritance", "legacy"],
    tags: ["theme"],
    aiContext: "mentioned",
    color: "#2E4A7D",
    fields: {
      Statement: "Which debts, duties, and stories are worth carrying forward?",
      Motifs: "A key hidden in a tide table",
    },
    notes: "The book's moral argument: inheritance is chosen as much as received.",
  },
]

export interface SampleNote {
  text: string
  /** Dictated on the device, else typed. */
  dictated: boolean
  /** How long before the book was made it was caught, so the newest shows first. */
  minutesAgo: number
}

/** Ideas waiting in the Inbox, to show what it's for. */
export const SAMPLE_INBOX: SampleNote[] = [
  {
    text: "Jonas hums the same three bars of a shanty whenever he lies. Plant it on the ferry, pay it off at the Light.",
    dictated: false,
    minutesAgo: 90,
  },
  {
    text: "What if the last page of the ledger is in Thomas's hand, not their father's?",
    dictated: true,
    minutesAgo: 20,
  },
]
