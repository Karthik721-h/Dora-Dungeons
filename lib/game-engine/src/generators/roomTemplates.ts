import { EventType } from "../types/index.js";

/**
 * Pure data: room templates used by DungeonGenerator.
 * Each template defines name/description candidates so generated rooms
 * feel unique even when reusing the same template type.
 *
 * Adding a new template = add an entry. No generator code changes.
 */
export interface RoomTemplate {
  id: string;
  nameCandidates: string[];
  descriptionCandidates: string[];
  ambientCandidates: string[];
  preferredEvents: EventType[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  enemyGroups?: string[][];
  trapDamage?: number;
  treasureItems?: string[];
  goldRange?: [number, number];
  shrineType?: "health" | "mana" | "fortune";
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: "entrance",
    nameCandidates: ["The Dungeon Entrance"],
    descriptionCandidates: [
      "You stand at the threshold of darkness. A damp chill seeps from the stone walls. Torches flicker and cast long shadows. Scratches on the wall read: 'Turn back.' You won't.",
    ],
    ambientCandidates: ["The air is cold and smells of rot and old stone."],
    preferredEvents: [EventType.STORY],
    difficulty: 1,
    tags: ["start"],
  },
  {
    id: "guard_room",
    nameCandidates: ["The Guard Room", "The Patrol Hall", "The Watch Chamber"],
    descriptionCandidates: [
      "A wide room with rotting weapon racks and overturned furniture. Goblins patrol the far wall — their eyes snap toward you.",
      "Bones crunch underfoot. Two sentries stand at the far end, blocking the passage ahead.",
      "A vast corridor of crumbling stone columns. Patrol marks are scratched into the floor. Something moves in the dark.",
    ],
    ambientCandidates: [
      "The distant dripping of water echoes in the dark.",
      "A guttering torch casts long shadows across the stone.",
      "The creak of old timber breaks the silence.",
    ],
    preferredEvents: [EventType.COMBAT],
    difficulty: 1,
    tags: ["combat", "early"],
    enemyGroups: [
      ["goblin_scout", "goblin_grunt"],
      ["goblin_grunt", "goblin_grunt"],
      ["goblin_scout", "goblin_scout"],
    ],
  },
  {
    id: "armory",
    nameCandidates: ["The Abandoned Armory", "The Rusted Armory", "The Weapon Cache"],
    descriptionCandidates: [
      "Weapon racks line the walls, most rusted and broken. But something still gleams in the dust.",
      "Shields and blades hang from iron hooks. Most are corroded — but one catches your eye.",
      "A vaulted storage room. Crates of old gear are stacked to the ceiling. Some still contain salvageable equipment.",
    ],
    ambientCandidates: [
      "The smell of oil and rust fills the air.",
      "Metal scrapes against stone somewhere in the dark.",
      "The torchlight glints off polished steel.",
    ],
    preferredEvents: [EventType.TREASURE],
    difficulty: 1,
    tags: ["treasure", "equipment"],
    treasureItems: ["iron_sword", "silver_dagger", "leather_armor"],
    goldRange: [5, 15],
  },
  {
    id: "storage",
    nameCandidates: ["The Storage Room", "The Supply Chamber", "The Old Cellar"],
    descriptionCandidates: [
      "Rotting crates and cracked barrels fill this room. Something rises from behind a collapsed shelf.",
      "A cluttered chamber of broken furniture and old supplies. Not as abandoned as it looks.",
      "Shelves sag under the weight of old goods. Dust hangs thick in the air — and something else does too.",
    ],
    ambientCandidates: [
      "The floorboards creak underfoot. Something skitters in the dark corners.",
      "A faint scratching sound echoes from behind the walls.",
      "The smell of damp wood and mold is overwhelming.",
    ],
    preferredEvents: [EventType.COMBAT],
    difficulty: 2,
    tags: ["combat"],
    enemyGroups: [["skeleton"], ["skeleton", "skeleton_archer"], ["goblin_grunt", "skeleton"]],
  },
  {
    id: "shrine_room",
    nameCandidates: ["The Sacred Shrine", "The Old Altar", "The Stone Shrine"],
    descriptionCandidates: [
      "A small alcove carved into the dungeon wall. A glowing shrine pulses with residual magic.",
      "An ancient altar stands at the center of the room. Runes carved into its surface still glow faintly.",
      "Someone — or something — built this shrine long ago. Its power has not faded.",
    ],
    ambientCandidates: [
      "A gentle hum fills the air. The shrine radiates warmth.",
      "Carved markings on the walls hint at rituals performed here.",
      "The air is inexplicably still and calm.",
    ],
    preferredEvents: [EventType.SHRINE],
    difficulty: 1,
    tags: ["shrine", "restoration"],
    shrineType: "health",
  },
  {
    id: "mana_shrine",
    nameCandidates: ["The Arcane Font", "The Mana Well", "The Spellcaster's Nook"],
    descriptionCandidates: [
      "Crystalline formations jut from the floor, thrumming with arcane energy.",
      "A bowl of shimmering liquid sits on a stone pedestal. It smells of ozone.",
      "The walls are engraved with arcane formulae. A concentrated font of mana hums here.",
    ],
    ambientCandidates: [
      "Your fingertips tingle. The air crackles softly.",
      "Light bends strangely around the mana source.",
    ],
    preferredEvents: [EventType.SHRINE],
    difficulty: 1,
    tags: ["shrine", "mana"],
    shrineType: "mana",
  },
  {
    id: "library",
    nameCandidates: ["The Forgotten Library", "The Dusty Scriptorium", "The Archive"],
    descriptionCandidates: [
      "Towering shelves of crumbling tomes reach the vaulted ceiling. A robed figure turns from a glowing lectern, eyes blazing with violet fire.",
      "Bookshelves collapse under the weight of centuries of knowledge. A dark scholar waits between them.",
      "Scrolls and manuscripts overflow from ancient shelves. Their guardian has no intention of letting you read in peace.",
    ],
    ambientCandidates: [
      "Whispering pages drift through the air. Knowledge and danger hang equally heavy.",
      "The smell of old parchment mixes with the acrid scent of ozone.",
    ],
    preferredEvents: [EventType.COMBAT],
    difficulty: 3,
    tags: ["combat", "caster"],
    enemyGroups: [["dark_mage"], ["goblin_shaman", "skeleton"], ["dark_mage", "skeleton_archer"]],
  },
  {
    id: "trap_chamber",
    nameCandidates: ["The Pressure Chamber", "The Killing Floor", "The Spring Trap Hall"],
    descriptionCandidates: [
      "This narrow passage is unnervingly clean — no dust, no bones. Something is wrong.",
      "The floor is etched with faint scoring marks. Old stains pattern the walls at chest height.",
      "A long corridor. Too long, and too empty. The air feels wrong.",
    ],
    ambientCandidates: [
      "The air hums with tension.",
      "Something clicks faintly with each step.",
      "You sense something mechanical hidden in the walls.",
    ],
    preferredEvents: [EventType.TRAP],
    difficulty: 2,
    tags: ["trap", "hazard"],
    trapDamage: 18,
  },
  {
    id: "crypts",
    nameCandidates: ["The Ancient Crypts", "The Burial Halls", "The Bone Vaults"],
    descriptionCandidates: [
      "Low-hanging burial niches line the walls. Skeletal forms animate as you enter — their empty sockets glowing faint red.",
      "Sarcophagi are stacked three deep along every wall. The lids are all ajar. Nothing good waits inside.",
      "A charnel hall. The dead here were interred standing — and now they walk.",
    ],
    ambientCandidates: [
      "The silence here has a weight to it. You are not alone.",
      "A faint rattling echoes from the walls — bone on stone.",
      "The cold is different here. Bone-deep.",
    ],
    preferredEvents: [EventType.COMBAT],
    difficulty: 3,
    tags: ["combat", "undead"],
    enemyGroups: [
      ["skeleton", "skeleton"],
      ["skeleton", "skeleton_archer"],
      ["skeleton_archer", "skeleton_archer"],
    ],
  },
  {
    id: "treasury",
    nameCandidates: ["The Hidden Treasury", "The Vault", "The Gold Cache"],
    descriptionCandidates: [
      "A small vault, sealed and forgotten. Coins and relics are piled in the corners. Someone left in a hurry.",
      "Behind a collapsed false wall you find a hoard — modest, but real. Weapons, potions, coin.",
      "A treasure room, dust-thick and undisturbed. Until now.",
    ],
    ambientCandidates: [
      "The glint of gold catches your torchlight.",
      "Coin piles rustle in a draft from some unseen crack.",
    ],
    preferredEvents: [EventType.TREASURE],
    difficulty: 2,
    tags: ["treasure", "loot"],
    treasureItems: ["chain_mail", "runic_blade", "enchanted_ring", "speed_boots"],
    goldRange: [15, 35],
  },
  {
    id: "boss_throne",
    nameCandidates: [
      "The Dark Throne Room",
      "The Warlord's Chamber",
      "The Obsidian Hall",
    ],
    descriptionCandidates: [
      "A vast, vaulted chamber dominated by an obsidian throne. On it sits the Orc Warlord — massive, scarred, armored in black iron. Two Orc Guards flank him. The warlord's eye opens. 'Another fool has come to die.'",
      "Banners of black iron hang in the torchless dark. A massive figure rises from the throne — it has been waiting for you.",
      "The ceiling is lost in shadow. The chamber smells of iron and old blood. The boss stands between you and freedom.",
    ],
    ambientCandidates: [
      "The torches burn black here. The air tastes of iron and dread.",
      "The silence is absolute — broken only by the measured breathing of what waits ahead.",
    ],
    preferredEvents: [EventType.COMBAT],
    difficulty: 5,
    tags: ["boss", "final"],
    enemyGroups: [
      ["orc_guard", "orc_guard", "orc_warlord"],
      ["orc_guard", "orc_warlord"],
      ["orc_warlord"],
    ],
  },
];

export function getTemplateById(id: string): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByTag(tag: string): RoomTemplate[] {
  return ROOM_TEMPLATES.filter((t) => t.tags.includes(tag));
}

export function getTemplatesByDifficulty(maxDifficulty: number): RoomTemplate[] {
  return ROOM_TEMPLATES.filter(
    (t) => t.difficulty <= maxDifficulty && !t.tags.includes("start") && !t.tags.includes("boss")
  );
}
