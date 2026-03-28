import { ParsedCommand, ActionType, Direction } from "../types/index.js";

const ACTION_KEYWORDS: Record<ActionType, string[]> = {
  [ActionType.ATTACK]: ["attack", "hit", "strike", "fight", "kill", "slay", "stab", "slash"],
  [ActionType.DEFEND]: ["defend", "block", "guard", "shield", "protect"],
  [ActionType.MOVE]: ["move", "go", "walk", "run", "travel", "head", "north", "south", "east", "west", "up", "down"],
  [ActionType.CAST_SPELL]: ["cast", "spell", "magic", "fireball", "heal", "lightning", "freeze"],
  [ActionType.LOOK]: ["look", "examine", "inspect", "observe", "describe", "where", "survey"],
  [ActionType.STATUS]: ["status", "stats", "health", "hp", "inventory", "me", "self", "level"],
  [ActionType.TAKE]: ["take", "grab", "pick", "loot", "collect"],
  [ActionType.USE]: ["use", "drink", "eat", "equip", "wield"],
  [ActionType.UNKNOWN]: [],
};

const DIRECTION_KEYWORDS: Record<Direction, string[]> = {
  [Direction.NORTH]: ["north", "n"],
  [Direction.SOUTH]: ["south", "s"],
  [Direction.EAST]: ["east", "e"],
  [Direction.WEST]: ["west", "w"],
  [Direction.UP]: ["up", "u", "upstairs"],
  [Direction.DOWN]: ["down", "d", "downstairs"],
};

function detectAction(tokens: string[]): ActionType {
  for (const token of tokens) {
    for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
      if (keywords.includes(token)) {
        return action as ActionType;
      }
    }
  }
  return ActionType.UNKNOWN;
}

function detectDirection(tokens: string[]): Direction | undefined {
  for (const token of tokens) {
    for (const [direction, keywords] of Object.entries(DIRECTION_KEYWORDS)) {
      if (keywords.includes(token)) {
        return direction as Direction;
      }
    }
  }
  return undefined;
}

function detectTarget(tokens: string[], action: ActionType): string | undefined {
  const stopWords = new Set([
    "the", "a", "an", "my", "at", "on", "in", "with", "to", "from",
    ...Object.values(ACTION_KEYWORDS).flat(),
  ]);

  const relevantTokens = tokens.filter((t) => !stopWords.has(t));

  if (relevantTokens.length === 0) return undefined;

  if (action === ActionType.CAST_SPELL) {
    const spellKeywords = ["fireball", "heal", "lightning", "freeze", "blizzard", "inferno"];
    const spell = relevantTokens.find((t) => spellKeywords.includes(t));
    if (spell) return spell.toUpperCase();
  }

  return relevantTokens.join(" ");
}

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const tokens = raw.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { action: ActionType.UNKNOWN, raw };
  }

  const action = detectAction(tokens);
  const direction = detectDirection(tokens);
  const target = direction ? undefined : detectTarget(tokens, action);

  return {
    action,
    target: target || undefined,
    direction: direction || undefined,
    raw,
  };
}

export class CommandParser {
  parse(input: string): ParsedCommand {
    return parseCommand(input);
  }
}
