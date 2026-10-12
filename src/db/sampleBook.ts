/*
 * The sample book from the prototype (prototype/data.js), seeded on first run so the app opens on real prose.
 * M0 seeds Act I and the first chapter of Act II. Events, plot threads and themes arrive with the planner (M1),
 * once auto-mentions can be scoped per type and "storm" or "mourning" in prose stop counting as mentions.
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
  place: string
  time: string
  beat: string
  target: number
  labels: string[]
  notes?: string
  beats: [text: string, done: boolean][]
  scenes: SampleScene[]
}

export interface SampleEntry {
  key: string
  type: string
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
  templateKey: "save_the_cat",
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
    beats: [
      ["Agnes opens the restricted shelf", false],
      ["Elias finds a missing witness", false],
      ["Mara admits she may stay", false],
    ],
    scenes: [],
  },
]

const CHARACTER_FIELDS = ["Role", "Age", "Appearance", "Personality", "Goal", "Wound / fear", "Voice & speech", "Arc"]

/** The built-in codex types (DESIGN.md §7); users add fields and custom types later. */
export const CODEX_TYPES = [
  { key: "characters", name: "Characters", icon: "user-round", fields: CHARACTER_FIELDS },
  { key: "locations", name: "Locations", icon: "map-pin", fields: ["Atmosphere", "Senses", "History"] },
  { key: "objects", name: "Objects", icon: "key-round", fields: ["Description", "Owner", "Secret"] },
  { key: "factions", name: "Factions", icon: "shield", fields: ["Power", "Public face", "Secret"] },
  { key: "lore", name: "Lore / Magic / Tech", icon: "sparkles", fields: ["Meaning", "Rules", "Symbol"] },
  { key: "events", name: "Events", icon: "calendar", fields: ["When", "Where", "Consequences"] },
  { key: "plot_threads", name: "Plot threads", icon: "spline", fields: ["Question", "Stakes", "Resolution"] },
  { key: "themes", name: "Themes", icon: "feather", fields: ["Statement", "Motifs"] },
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
]
