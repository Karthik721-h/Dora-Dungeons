/**
 * IntentProcessor
 *
 * Sits between the Voice Input layer and the CommandParser.
 * Normalizes natural speech into canonical game commands.
 *
 * Pipeline: Voice Input → IntentProcessor → /api/game/action → CommandParser → GameEngine
 *
 * To add new patterns, append to PHRASE_PATTERNS. No other code changes needed.
 */

interface PhrasePair {
  pattern: RegExp;
  canonical: (match: RegExpMatchArray) => string;
}

const FILLER_WORDS = [
  "um", "uh", "uhh", "er", "hmm", "okay", "ok", "well", "like",
  "you know", "i mean", "just", "please", "quickly", "carefully", "again"
];

const DIRECTION_MAP: Record<string, string> = {
  north: "north", n: "north",
  south: "south", s: "south",
  east: "east", e: "east",
  west: "west", w: "west",
  up: "up", upstairs: "up", ascend: "up",
  down: "down", downstairs: "down", descend: "down",
  left: "west", right: "east", forward: "north", backward: "south", back: "south",
  "the left": "west", "the right": "east", "the north": "north", "the south": "south",
  "the east": "east", "the west": "west",
};

function resolveDirection(raw: string): string | null {
  const cleaned = raw.toLowerCase().trim().replace(/^(the|a|an)\s+/, "");
  return DIRECTION_MAP[cleaned] ?? DIRECTION_MAP[raw.toLowerCase().trim()] ?? null;
}

function stripFillers(input: string): string {
  let out = input.toLowerCase().trim();
  for (const filler of FILLER_WORDS) {
    out = out.replace(new RegExp(`\\b${filler}\\b`, "g"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const PHRASE_PATTERNS: PhrasePair[] = [
  // --- Logout ---
  {
    pattern: /^(?:log\s*out|logout|sign\s*out|exit\s*account|log\s*me\s*out|sign\s*me\s*out|quit\s*game|leave\s*game)$/,
    canonical: () => "logout",
  },

  // --- Voice toggle ---
  {
    pattern: /^(?:change\s+voice|switch\s+voice|toggle\s+voice|change\s+narrator|switch\s+narrator|voice\s+change|voice\s+switch)$/,
    canonical: () => "change_voice",
  },

  // --- Repeat last message ---
  {
    pattern: /^(repeat|say (that |it )?again|what did you say|again|huh|what\??)/,
    canonical: () => "repeat",
  },

  // --- Movement ---
  // "go/walk/head/run/travel/move (to the)? <direction>"
  {
    pattern: /^(?:go|walk|head|run|travel|move|proceed|step)\s+(?:to\s+)?(?:the\s+)?(north|south|east|west|up|down|left|right|forward|backward|back|upstairs|downstairs|n|s|e|w)$/,
    canonical: (m) => {
      const dir = resolveDirection(m[1]!);
      return dir ? `move ${dir}` : `move ${m[1]}`;
    },
  },
  // "go through the north door/passage/corridor/exit"
  {
    pattern: /^(?:go|walk|head|travel|move|take)\s+(?:through\s+)?(?:the\s+)?(north|south|east|west|up|down|left|right)\s+(?:door|passage|corridor|path|exit|hallway|hall|stairs?|way|gate)?/,
    canonical: (m) => {
      const dir = resolveDirection(m[1]!);
      return dir ? `move ${dir}` : `move ${m[1]}`;
    },
  },
  // bare direction: "north", "go west"
  {
    pattern: /^(?:go\s+)?(north|south|east|west|upstairs|downstairs)$/,
    canonical: (m) => {
      const dir = resolveDirection(m[1]!);
      return dir ? `move ${dir}` : `move ${m[1]}`;
    },
  },

  // --- Attack ---
  // "hit/strike/fight/kill/slay/stab (the/that/a)? <target>"
  {
    pattern: /^(?:hit|strike|fight|kill|slay|stab|slash|attack|swing at|smite|beat up?|punch)\s+(?:the\s+|that\s+|a\s+)?(.+)$/,
    canonical: (m) => `attack ${m[1]!.trim()}`,
  },
  // "attack" alone
  {
    pattern: /^(?:attack|fight|fight them|fight it)$/,
    canonical: () => "attack",
  },

  // --- Defend ---
  {
    pattern: /^(?:defend|block|guard|shield|parry|take cover|protect myself?|brace(?:\s+myself?)?)$/,
    canonical: () => "defend",
  },

  // --- Flee ---
  {
    pattern: /^(?:run away|flee|escape|retreat|bail|get out|run for it|get me out of here)$/,
    canonical: () => "flee",
  },

  // --- Cast spells ---
  {
    pattern: /^(?:cast|use|invoke|throw|hurl|launch|shoot|fire)\s+(?:a\s+)?fireball(?:\s+at\s+.+)?$/,
    canonical: () => "cast fireball",
  },
  {
    pattern: /^(?:cast|use|invoke)\s+(?:a\s+)?lightning(?:\s+bolt)?(?:\s+at\s+.+)?$/,
    canonical: () => "cast lightning",
  },
  {
    pattern: /^(?:cast|use|invoke)\s+(?:a\s+)?(?:freeze|ice|frost)(?:\s+at\s+.+)?$/,
    canonical: () => "cast freeze",
  },
  {
    pattern: /^(?:cast|use|invoke)\s+(?:an?\s+)?inferno(?:\s+at\s+.+)?$/,
    canonical: () => "cast inferno",
  },
  {
    pattern: /^(?:cast|use|invoke)\s+(?:a\s+)?(?:meteor(?: strike)?|meteor)(?:\s+at\s+.+)?$/,
    canonical: () => "cast meteor strike",
  },
  {
    pattern: /^(?:cast|use|invoke)\s+(?:a\s+)?poison(?: dart)?(?:\s+at\s+.+)?$/,
    canonical: () => "cast poison dart",
  },
  {
    pattern: /^(?:cast|use|invoke)\s+(?:a\s+)?shield$/,
    canonical: () => "cast shield",
  },
  // heal variants: "heal", "heal myself", "heal up", "restore health", "cast heal"
  {
    pattern: /^(?:heal(?:\s+(?:myself?|me|up))?|restore(?:\s+(?:health|hp))?|(?:cast|use)\s+heal)$/,
    canonical: () => "cast heal",
  },
  // generic "cast <anything>"
  {
    pattern: /^cast\s+(.+)$/,
    canonical: (m) => `cast ${m[1]!.trim()}`,
  },

  // --- Look / Examine ---
  {
    pattern: /^(?:look(?: around)?|examine|inspect|observe|describe|survey|scan|where am i\??|what(?:'s| is) (?:here|around)|take a look)$/,
    canonical: () => "look",
  },

  // --- Status ---
  {
    pattern: /^(?:status|stats|show (?:my )?(?:stats?|status|health)|(?:my\s+)?(?:hp|health|inventory|abilities)|what(?:'s| is) my (?:health|status|hp))$/,
    canonical: () => "status",
  },

  // --- Take item ---
  {
    pattern: /^(?:take|grab|pick up|loot|collect|retrieve)\s+(?:the\s+)?(.+)$/,
    canonical: (m) => `take ${m[1]!.trim()}`,
  },

  // --- Use item ---
  {
    pattern: /^(?:use|drink|eat|consume|equip|wield|wear|apply)\s+(?:the\s+|a\s+)?(.+)$/,
    canonical: (m) => `use ${m[1]!.trim()}`,
  },

  // --- Shop: open ---
  {
    pattern: /^(?:open|enter|go\s+to|visit|access)\s+(?:the\s+)?shop$/,
    canonical: () => "open_shop",
  },

  // --- Shop: buy ---
  {
    pattern: /^(?:buy|purchase|get|browse)\s+(?:weapons?|arms?|gear|equipment|swords?|blades?|axes?)$/,
    canonical: () => "shop_buy",
  },

  // --- Shop: sell ---
  {
    pattern: /^sell\s+(?:items?|stuff|things?|goods?|my\s+items?)$/,
    canonical: () => "shop_sell",
  },

  // --- Shop: upgrade ---
  {
    pattern: /^upgrade\s+(?:armou?r|gear|equipment|protection|my\s+armou?r)$/,
    canonical: () => "shop_upgrade",
  },

  // --- Shop: exit ---
  {
    pattern: /^(?:exit|leave|close|quit|stop|done\s+(?:with|shopping)|back)\s+(?:(?:the\s+)?shop|shopping)?$|^(?:exit|leave)\s+(?:the\s+)?shop$/,
    canonical: () => "exit_shop",
  },
];

/**
 * Process a raw speech transcript into a canonical game command.
 * Returns the canonical string if a pattern matches, otherwise returns the
 * stripped input so the backend CommandParser can still attempt to parse it.
 */
export function processIntent(rawTranscript: string): {
  canonical: string;
  wasNormalized: boolean;
} {
  const stripped = stripFillers(rawTranscript);

  for (const { pattern, canonical } of PHRASE_PATTERNS) {
    const match = stripped.match(pattern);
    if (match) {
      const result = canonical(match);
      const wasNormalized = result !== rawTranscript.toLowerCase().trim();
      return { canonical: result, wasNormalized };
    }
  }

  return { canonical: stripped || rawTranscript.trim(), wasNormalized: false };
}

/**
 * Map a direction to a stereo pan value (-1 = left, 0 = center, +1 = right).
 * Used by AudioManager to give directional spatial cues.
 */
export function directionToPan(direction: string): number {
  switch (direction.toLowerCase()) {
    case "west": return -1;
    case "east": return 1;
    case "north": return 0;
    case "south": return 0;
    case "up": return 0;
    case "down": return 0;
    default: return 0;
  }
}

/**
 * Given an array of exit directions, return a text hint for the TTS.
 * e.g. ["north", "west"] → "Exits: north and west."
 */
export function describeExits(exits: string[]): string {
  if (exits.length === 0) return "There are no obvious exits.";
  if (exits.length === 1) return `One exit: ${exits[0]}.`;
  const last = exits[exits.length - 1];
  const rest = exits.slice(0, -1).join(", ");
  return `Exits: ${rest} and ${last}.`;
}
