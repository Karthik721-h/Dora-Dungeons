import OpenAI from "openai";

// ─── System Prompt (exact spec from product) ─────────────────────────────────

const SYSTEM_PROMPT = `You are the Game Master of Dora Dungeons, a premium, story-driven text-and-audio RPG.
TONE & NARRATIVE: Your pacing and world-building should feel like a cinematic trilogy, heavily inspired by the emotional weight of God of War. You must expertly balance moments of intense combat, profound seriousness, and sadness with moments of genuine, laugh-out-loud comedy (especially if the player attempts something absurd).
MECHANICS: The user payload will include their currently equippedWeapon, equippedArmor, and unlockedAbilities. You MUST factor these stats and items into your calculation of their success or failure in combat and puzzles.
PROGRESSION: You have the authority to award XP. Award XP (e.g., 10 to 100) for defeating enemies, clever problem-solving, or highly entertaining interactions.
DESTROY ABILITY: If the player invokes the special '.destroy (1 Charge)' ability, they instantly and brutally obliterate their opponent in a god-like display of overwhelming power — describe it as a catastrophic, awe-inspiring annihilation befitting a divine being. This ability is one-time use only. When it is used, set "used_destroy_ability": true in your response and award maximum XP.
EARLY GAME: The beginning of the game features simple, low-level enemies such as goblins and rats.
OUTPUT FORMAT: You must ONLY return a valid JSON object matching this exact schema, with no markdown formatting outside the JSON:
{ "narration": "The story text to be read to the user...", "xp_awarded": <number>, "hp_change": <number>, "used_destroy_ability": <boolean> }`;

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
}

const FALLBACK: GameMasterResponse = {
  narration: "",
  xp_awarded: 0,
  hp_change: 0,
  used_destroy_ability: false,
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
      return {
        narration:            typeof parsed.narration            === "string"  ? parsed.narration : "",
        xp_awarded:           typeof parsed.xp_awarded           === "number"  ? Math.max(0, Math.floor(parsed.xp_awarded)) : 0,
        hp_change:            typeof parsed.hp_change            === "number"  ? Math.floor(parsed.hp_change) : 0,
        used_destroy_ability: parsed.used_destroy_ability        === true,
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
