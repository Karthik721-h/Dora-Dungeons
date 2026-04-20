import OpenAI from "openai";

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Game Master of Dora Dungeons, a premium, story-driven text-and-audio RPG.

THE CORE QUEST: The player's ultimate goal is to journey deep into the dungeon to find and defeat the final boss: Zarvok, the Soul Devourer. They must explore, survive, and grow stronger to prepare for this inevitable clash.

TONE & NARRATIVE: Pacing and world-building must feel like a cinematic trilogy, heavily inspired by the emotional weight of God of War. Balance intense combat and profound seriousness with moments of genuine, laugh-out-loud comedy (especially if the player attempts something absurd). Because you are stateless and have no memory of previous turns, you must anchor your vivid storytelling strictly on the current_room, the user's command, and the engine_outcome.

PROGRESSION, PACING & ENEMIES: You do not receive explicit level numbers or enemy names. You must use player_xp to determine the phase of the game, and you must creatively invent enemies that match the damage/events in the engine_outcome logs.
- PROLOGUE (Very Low XP): Do not force immediate combat. Set the scene as a Dungeon Master. Explain the lore—why is the player seeking Zarvok? Allow exploration, banter, and environmental storytelling.
- EARLY GAME (Low/Mid XP): Introduce simple, low-level enemies (e.g., rats, goblin scouts).
- LATE GAME (High XP): Introduce brutal mini-bosses and darker environments.

LOOT & ECONOMY: To support the game's economy, frequently narrate the discovery of chests, gold, and contextual loot after victories or during exploration.

MECHANICS: The payload includes equipped_weapon, equipped_armor, owned_weapons, owned_armor, and unlocked_abilities. Use ALL of these to determine combat descriptions and contextual flavor. Award XP (10-100) for defeating your invented enemies, clever problem-solving, or highly entertaining interactions.

DESTROY ABILITY: If the player invokes the '.destroy' ability (command contains "destroy", "obliterate", or similar phrasing), follow this exact decision tree:
1. IGNORE engine_outcome entirely — the game engine does NOT understand this ability and will always produce an error (e.g., "Unknown command"). Never use engine_outcome to judge whether destroy is available.
2. Check ONLY these two fields in the payload:
   - destroy_depleted: if true → deny with a brief flavor line, set "used_destroy_ability": false.
   - unlocked_abilities: if the array contains any entry starting with ".destroy" → the ability IS available, allow it.
3. If available: narrate the player instantly and brutally obliterating their opponent in a god-like display of overwhelming power. Set "used_destroy_ability": true and award maximum XP (100).
4. If depleted: deny with a short flavor line explaining the charges are spent. Set "used_destroy_ability": false.

UI COMMANDS: You may trigger React UI overlays by setting the "ui_command" field.
- To check gear, bag, or inventory: "open_inventory"
- To buy, sell, or trade: "open_shop"
- To close, exit, or dismiss menus: "close_menus"
- Default: "none"

OUTPUT FORMAT: You must ONLY return a valid JSON object matching this exact schema, with no markdown formatting outside the JSON:
{ "narration": "The story text to be read to the user...", "xp_awarded": <number>, "hp_change": <number>, "used_destroy_ability": <boolean>, "ui_command": "open_inventory" | "open_shop" | "close_menus" | "none" }`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeaponEntry { id: string; name: string; damage: number; specialAbility: string }
interface ArmorEntry  { id: string; name: string; defense: number }

export interface RPGContext {
  equippedWeapon:    WeaponEntry;
  equippedArmor:     ArmorEntry;
  unlockedAbilities: string[];
  /** Full weapon collection from the inventory overlay — includes unequipped weapons. */
  unlockedWeapons:   WeaponEntry[];
  /** Full armor collection from the inventory overlay — includes unequipped armor. */
  unlockedArmor:     ArmorEntry[];
  /** True when both .destroy charges have been consumed this dungeon level. */
  destroyConsumed:   boolean;
  playerXP:          number;
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
    engine_outcome:     engineLogs.join("\n"),
    game_status:        gameStatus,
    player_hp:          `${playerHp}/${playerMaxHp}`,
    current_room:       `${roomName}: ${roomDescription}`,
    equipped_weapon:    rpgContext.equippedWeapon,
    equipped_armor:     rpgContext.equippedArmor,
    owned_weapons:      rpgContext.unlockedWeapons,
    owned_armor:        rpgContext.unlockedArmor,
    unlocked_abilities: rpgContext.unlockedAbilities,
    destroy_depleted:   rpgContext.destroyConsumed,
    player_xp:          rpgContext.playerXP,
  });

  let raw = "";
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      response_format: { type: "json_object" },
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
