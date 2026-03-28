import { ParsedCommand, ActionType, Direction } from "../types/index.js";

const ACTION_KEYWORDS: Record<ActionType, string[]> = {
  [ActionType.ATTACK]: ["attack", "hit", "strike", "fight", "kill", "slay", "stab", "slash", "swing", "smite"],
  [ActionType.DEFEND]: ["defend", "block", "guard", "shield", "protect", "parry", "brace"],
  [ActionType.MOVE]: ["move", "go", "walk", "run", "travel", "head", "north", "south", "east", "west", "up", "down"],
  [ActionType.CAST_SPELL]: ["cast", "spell", "magic", "fireball", "heal", "lightning", "freeze", "inferno", "shield", "poison", "use spell", "invoke"],
  [ActionType.USE_ITEM]: ["use", "drink", "eat", "consume", "quaff", "equip", "wield", "wear", "apply", "use item"],
  [ActionType.LOOK]: ["look", "examine", "inspect", "observe", "describe", "where", "survey", "scan", "check", "what"],
  [ActionType.STATUS]: ["status", "stats", "health", "hp", "inventory", "me", "self", "level", "bag", "pack", "abilities"],
  [ActionType.TAKE]: ["take", "grab", "pick", "loot", "collect", "retrieve"],
  [ActionType.FLEE]: ["flee", "run", "escape", "retreat", "run away", "get out", "bail"],
  [ActionType.UNKNOWN]: [],
};

const DIRECTION_KEYWORDS: Record<Direction, string[]> = {
  [Direction.NORTH]: ["north", "n"],
  [Direction.SOUTH]: ["south", "s"],
  [Direction.EAST]: ["east", "e"],
  [Direction.WEST]: ["west", "w"],
  [Direction.UP]: ["up", "u", "upstairs", "ascend"],
  [Direction.DOWN]: ["down", "d", "downstairs", "descend"],
};

const PREPOSITIONS = new Set(["on", "at", "the", "a", "an", "to", "from", "into", "upon", "with", "using"]);
const FILLER_WORDS = new Set(["quickly", "carefully", "bravely", "fiercely", "slowly", "again", "now", "please"]);

const SPELL_NAMES = new Set([
  "fireball", "heal", "lightning", "freeze", "inferno", "shield", "poison", "poison dart",
  "blizzard", "thunder", "ice", "flame", "bolt"
]);

const ITEM_NAMES = new Set([
  "potion", "health potion", "mana potion", "sword", "dagger", "armor", "mail", "ring", "scroll"
]);

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAction(tokens: string[]): ActionType {
  for (const token of tokens) {
    for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
      if (keywords.includes(token)) return action as ActionType;
    }
  }
  for (const phrase of ["cast", "use item", "use spell", "run away"]) {
    if (tokens.join(" ").includes(phrase)) {
      if (phrase === "cast" || phrase === "use spell") return ActionType.CAST_SPELL;
      if (phrase === "use item") return ActionType.USE_ITEM;
      if (phrase === "run away") return ActionType.FLEE;
    }
  }
  return ActionType.UNKNOWN;
}

function detectDirection(tokens: string[]): Direction | undefined {
  for (const token of tokens) {
    for (const [direction, keywords] of Object.entries(DIRECTION_KEYWORDS)) {
      if (keywords.includes(token)) return direction as Direction;
    }
  }
  return undefined;
}

function detectSpell(tokens: string[], raw: string): string | undefined {
  const joined = tokens.join(" ");
  for (const spellName of [...SPELL_NAMES].sort((a, b) => b.length - a.length)) {
    if (joined.includes(spellName) || raw.toLowerCase().includes(spellName)) {
      return spellName.replace(" ", "_");
    }
  }
  const actionKeywords = new Set([...Object.values(ACTION_KEYWORDS).flat()]);
  const candidates = tokens.filter(
    (t) => !actionKeywords.has(t) && !PREPOSITIONS.has(t) && !FILLER_WORDS.has(t) && t.length > 2
  );
  if (candidates.length > 0) return candidates[0];
  return undefined;
}

function detectTarget(tokens: string[], action: ActionType, spellName?: string): string | undefined {
  const actionKeywords = new Set([...Object.values(ACTION_KEYWORDS).flat()]);
  const directionKeywords = new Set([...Object.values(DIRECTION_KEYWORDS).flat()]);

  const removeTokens = new Set([
    ...actionKeywords,
    ...directionKeywords,
    ...PREPOSITIONS,
    ...FILLER_WORDS,
  ]);

  if (spellName) {
    for (const part of spellName.split("_")) removeTokens.add(part);
  }

  const relevant = tokens.filter((t) => !removeTokens.has(t) && t.length > 1);
  if (relevant.length === 0) return undefined;

  return relevant.join(" ");
}

function detectItem(tokens: string[]): string | undefined {
  const joined = tokens.join(" ");
  for (const itemName of [...ITEM_NAMES].sort((a, b) => b.length - a.length)) {
    if (joined.includes(itemName)) return itemName;
  }
  const actionKeywords = new Set([...Object.values(ACTION_KEYWORDS).flat()]);
  const candidates = tokens.filter(
    (t) => !actionKeywords.has(t) && !PREPOSITIONS.has(t) && !FILLER_WORDS.has(t) && t.length > 2
  );
  if (candidates.length > 0) return candidates.join(" ");
  return undefined;
}

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const normalized = normalize(raw);
  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.length === 0) {
    return { action: ActionType.UNKNOWN, raw };
  }

  const action = detectAction(tokens);
  const direction = detectDirection(tokens);

  let target: string | undefined;
  let ability: string | undefined;
  let item: string | undefined;

  if (action === ActionType.MOVE && direction) {
    target = undefined;
  } else if (action === ActionType.CAST_SPELL) {
    ability = detectSpell(tokens, raw);
    target = detectTarget(tokens, action, ability);
  } else if (action === ActionType.USE_ITEM) {
    item = detectItem(tokens);
    target = undefined;
  } else if (action === ActionType.ATTACK || action === ActionType.FLEE) {
    target = detectTarget(tokens, action);
  }

  return {
    action,
    target: target || undefined,
    direction: direction || undefined,
    ability: ability || undefined,
    item: item || undefined,
    raw,
  };
}

export class CommandParser {
  parse(input: string): ParsedCommand {
    return parseCommand(input);
  }
}
