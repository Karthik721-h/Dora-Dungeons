import OpenAI from "openai";

// ─── System Prompt (exact spec from product) ─────────────────────────────────

const SYSTEM_PROMPT = `You are the Game Master of Dora Dungeons, a premium, story-driven text-and-audio RPG.
TONE & NARRATIVE: Your pacing and world-building should feel like a cinematic trilogy, heavily inspired by the emotional weight of God of War. You must expertly balance moments of intense combat, profound seriousness, and sadness with moments of genuine, laugh-out-loud comedy (especially if the player attempts something absurd).
MECHANICS: The user payload will include their currently equippedWeapon, equippedArmor, and unlockedAbilities. You MUST factor these stats and items into your calculation of their success or failure in combat and puzzles.
PROGRESSION: You have the authority to award XP. Award XP (e.g., 10 to 100) for defeating enemies, clever problem-solving, or highly entertaining interactions.
DESTROY ABILITY: If the player invokes a '.destroy' ability (they may say "use destroy", "obliterate", or any similar phrase clearly invoking this power), they instantly and brutally obliterate their opponent in a god-like display of overwhelming power — describe it as a catastrophic, awe-inspiring annihilation befitting a divine being. This ability has 2 charges per dungeon level — each use consumes one charge. When it is used, set "used_destroy_ability": true in your response and award maximum XP. IMPORTANT: Only say the player does NOT have this ability if "unlocked_abilities" in the payload is empty or contains no entry starting with ".destroy". If any ".destroy" entry IS in their unlocked_abilities (e.g. ".destroy (2 Charges)" or ".destroy (1 Charge)"), they have it and can use it.
STATUS COMMAND: When the engine output contains a STATUS block and the payload includes unlocked_abilities, you MUST append a natural-sounding sentence to your narration that announces those special abilities. Example: "You also carry a devastating special ability: .destroy — two charges per level, each obliterating any foe instantly." If unlocked_abilities is empty, do not mention it.
EARLY GAME: The beginning of the game features simple, low-level enemies such as goblins and rats.
UI COMMANDS: You may trigger React UI overlays by setting the "ui_command" field. Rules:
- If the player's intent is to check their gear, inspect their bag, view their inventory, or see their equipped items/abilities, set "ui_command" to "open_inventory".
- If the player wants to buy, sell, trade, or visit the merchant/shop/store, set "ui_command" to "open_shop".
- If the player wants to close, exit, or dismiss any menu, set "ui_command" to "close_menus".
- For all other commands, set "ui_command" to "none".
OUTPUT FORMAT: You must ONLY return a valid JSON object matching this exact schema, with no markdown formatting outside the JSON:
{ "narration": "The story text to be read to the user...", "xp_awarded": <number>, "hp_change": <number>, "used_destroy_ability": <boolean>, "ui_command": "open_inventory" | "open_shop" | "close_menus" | "none" }`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RPGContext {
  equippedWeapon: { id: string; name: string; damage: number; specialAbility: string };
  equippedArmor: { id: string; name: string; defense: number };
  unlockedAbilities: string[];
  playerXP: number;
}

export interface GameMasterResponse {
  narration: string;
  xp_awarded: number;
  hp_change: number;
  used_destroy_ability: boolean;
  ui_command: "open_inventory" | "open_shop" | "close_menus" | "none";
}

const FALLBACK: GameMasterResponse = {
  narration: "",
  xp_awarded: 0,
  hp_change: 0,
  used_destroy_ability: false,
  ui_command: "none",
};

// ─── Singleton OpenAI client (lazy-initialised) ───────────────────────────────

let _client: OpenAI | null | undefined = undefined;

function getClient(): OpenAI | null {
  if (_client !== undefined) return _client;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    console.warn("[gameMaster] OpenAI env vars missing — LLM narration disabled");
    _client = null;
  } else {
    _client = new OpenAI({ baseURL, apiKey });
  }
  return _client;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Ask the LLM Game Master to narrate the outcome of a command.
 * Always resolves — returns FALLBACK on any error so the game never breaks.
 */
export async function callGameMaster(
  command: string,
  engineLogs: string[],
  gameStatus: string,
  playerHp: number,
  playerMaxHp: number,
  roomName: string,
  roomDescription: string,
  rpgContext: RPGContext,
): Promise<GameMasterResponse> {
  const client = getClient();
  if (!client) return FALLBACK;

  const userPayload = JSON.stringify({
    command,
    engine_outcome: engineLogs.join("\n"),
    game_status: gameStatus,
    player_hp: `${playerHp}/${playerMaxHp}`,
    current_room: `${roomName}: ${roomDescription}`,
    equipped_weapon: rpgContext.equippedWeapon,
    equipped_armor:  rpgContext.equippedArmor,
    unlocked_abilities: rpgContext.unlockedAbilities,
    player_xp: rpgContext.playerXP,
  });

  let raw = "";
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPayload },
      ],
    });

    raw = completion.choices[0]?.message?.content ?? "";

    // Strip markdown code fences the LLM sometimes wraps around the JSON.
    // Handles ```json ... ```, ``` ... ```, and leading/trailing whitespace.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    // ── Inner try: JSON-parse errors log the raw LLM output for debugging ──
    try {
      const parsed = JSON.parse(cleaned) as Partial<GameMasterResponse>;
      const validUiCommands = new Set(["open_inventory", "open_shop", "close_menus", "none"]);
      const rawUiCommand = typeof parsed.ui_command === "string" ? parsed.ui_command : "none";
      return {
        narration:            typeof parsed.narration            === "string"  ? parsed.narration : "",
        xp_awarded:           typeof parsed.xp_awarded           === "number"  ? Math.max(0, Math.floor(parsed.xp_awarded)) : 0,
        hp_change:            typeof parsed.hp_change            === "number"  ? Math.floor(parsed.hp_change) : 0,
        used_destroy_ability: parsed.used_destroy_ability        === true,
        ui_command:           validUiCommands.has(rawUiCommand) ? rawUiCommand as GameMasterResponse["ui_command"] : "none",
      };
    } catch (parseErr) {
      console.error("[gameMaster] JSON parse failed. Raw LLM output:", raw);
      console.error("[gameMaster] Cleaned string:", cleaned);
      console.error("[gameMaster] Parse error:", parseErr);
      return FALLBACK;
    }
  } catch (err) {
    // Outer catch: network / API-level failure
    if (raw) console.error("[gameMaster] API error after receiving raw:", raw);
    console.error("[gameMaster] LLM call failed:", err);
    return FALLBACK;
  }
}
