import { Player, Enemy, StatusEffectType, EnemyType, ActionType, Direction } from "../types/index.js";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const NarrationEngine = {
  attackHit(attacker: string, defender: string, damage: number): string {
    const phrases = [
      `${attacker} lunges forward and strikes ${defender} for ${damage} damage!`,
      `${attacker} lands a solid blow on ${defender}, dealing ${damage} damage!`,
      `With a fierce swing, ${attacker} slashes ${defender} for ${damage} damage!`,
      `${attacker} connects with a powerful attack against ${defender} — ${damage} damage!`,
    ];
    return pick(phrases);
  },

  attackMiss(attacker: string, defender: string): string {
    const phrases = [
      `${attacker} swings at ${defender} but misses!`,
      `${defender} sidesteps ${attacker}'s attack!`,
      `${attacker}'s strike glances off ${defender} harmlessly.`,
    ];
    return pick(phrases);
  },

  enemyDefeated(enemy: Enemy): string {
    const deathPhrases: Record<EnemyType, string[]> = {
      [EnemyType.GOBLIN]: [
        `The ${enemy.name} lets out a dying squeal and crumples to the ground!`,
        `With a final gurgle, the ${enemy.name} collapses!`,
      ],
      [EnemyType.MAGE]: [
        `The ${enemy.name}'s arcane fire sputters out as they fall!`,
        `With a strangled gasp, the ${enemy.name} dissolves into sparks!`,
      ],
      [EnemyType.TANK]: [
        `The massive ${enemy.name} topples like a felled oak!`,
        `The ${enemy.name} crashes to the floor, shaking the dungeon walls!`,
      ],
      [EnemyType.SKELETON]: [
        `The ${enemy.name} shatters into a pile of rattling bones!`,
        `Bones scatter across the floor as the ${enemy.name} is destroyed!`,
      ],
      [EnemyType.BOSS]: [
        `With a thunderous roar, the mighty ${enemy.name} falls! The dungeon trembles in silence.`,
        `The ${enemy.name} lets out a final, earth-shaking scream and collapses!`,
      ],
    };
    return pick(deathPhrases[enemy.type] ?? [`The ${enemy.name} falls!`]);
  },

  playerDefeated(player: Player): string {
    const phrases = [
      `${player.name} falls to the dungeon floor. The darkness closes in...`,
      `Overwhelmed, ${player.name} collapses. The dungeon claims another soul.`,
      `${player.name}'s vision fades. Defeat.`,
    ];
    return pick(phrases);
  },

  playerDefend(player: Player): string {
    const phrases = [
      `${player.name} raises their guard, bracing for the coming blow.`,
      `${player.name} takes a defensive stance, shield arm forward.`,
      `${player.name} steadies themselves and prepares to absorb the attack.`,
    ];
    return pick(phrases);
  },

  spellCast(playerName: string, abilityName: string, targetName: string, damage: number): string {
    const templates: Record<string, string[]> = {
      Fireball: [
        `${playerName} raises their staff — a roaring sphere of fire erupts, slamming into ${targetName} for ${damage} blazing damage!`,
        `Incanting swiftly, ${playerName} hurls a Fireball at ${targetName}. It detonates on impact for ${damage} damage!`,
      ],
      Heal: [
        `A warm golden light envelops ${playerName} as they cast Heal, restoring vitality.`,
        `${playerName} channels healing energy, mending their wounds.`,
      ],
      Lightning: [
        `${playerName} calls down a bolt of lightning upon ${targetName} — ${damage} crackling damage!`,
        `The air smells of ozone as ${playerName}'s Lightning Strike hits ${targetName} for ${damage}!`,
      ],
      Freeze: [
        `${playerName} chants the words of frost — ice crystals tear through ${targetName} for ${damage} cold damage!`,
        `A burst of arctic cold from ${playerName} encases ${targetName} momentarily — ${damage} damage!`,
      ],
    };
    const lines = templates[abilityName] ?? [
      `${playerName} casts ${abilityName} at ${targetName} for ${damage} damage!`,
    ];
    return pick(lines);
  },

  spellHeal(playerName: string, abilityName: string, amount: number): string {
    const phrases = [
      `${playerName} channels healing magic, recovering ${amount} HP.`,
      `A soothing glow washes over ${playerName} — ${amount} HP restored.`,
      `${playerName} murmurs an incantation and feels strength return (+${amount} HP).`,
    ];
    return pick(phrases);
  },

  notEnoughMana(playerName: string, abilityName: string): string {
    return `${playerName} reaches for the arcane energy to cast ${abilityName}, but finds the well empty. Not enough mana!`;
  },

  statusEffectApplied(targetName: string, effectType: StatusEffectType): string {
    const phrases: Record<StatusEffectType, string[]> = {
      [StatusEffectType.POISON]: [
        `${targetName} is now poisoned — they'll suffer damage each turn!`,
        `A sickly green aura clings to ${targetName}. Poison courses through their veins.`,
      ],
      [StatusEffectType.STUN]: [
        `${targetName} reels, dazed and unable to act this round!`,
        `The blow staggers ${targetName} — they're stunned!`,
      ],
      [StatusEffectType.BURN]: [
        `${targetName} is on fire! Burning damage will continue each turn.`,
        `Flames lick across ${targetName}'s body. They're burning!`,
      ],
      [StatusEffectType.SHIELD]: [
        `A shimmering barrier forms around ${targetName}.`,
        `${targetName} is protected by a magical shield.`,
      ],
      [StatusEffectType.HASTE]: [
        `${targetName} surges with speed — they'll act before others!`,
        `${targetName} feels supernaturally fast.`,
      ],
    };
    return pick(phrases[effectType] ?? [`${targetName} is afflicted!`]);
  },

  statusEffectTick(targetName: string, effectType: StatusEffectType, damage: number): string {
    const phrases: Record<StatusEffectType, string[]> = {
      [StatusEffectType.POISON]: [`Poison burns through ${targetName}'s blood — ${damage} damage!`],
      [StatusEffectType.BURN]: [`Flames scorch ${targetName} for another ${damage} damage!`],
      [StatusEffectType.STUN]: [`${targetName} is still stunned and cannot act.`],
      [StatusEffectType.SHIELD]: [`${targetName}'s shield holds steady.`],
      [StatusEffectType.HASTE]: [`${targetName} moves with unnatural speed.`],
    };
    return pick(phrases[effectType] ?? [`${targetName} suffers ${damage} damage from their affliction!`]);
  },

  statusEffectExpired(targetName: string, effectType: StatusEffectType): string {
    const phrases: Record<StatusEffectType, string[]> = {
      [StatusEffectType.POISON]: [`The poison in ${targetName}'s veins finally fades.`],
      [StatusEffectType.STUN]: [`${targetName} shakes off the daze and regains their senses.`],
      [StatusEffectType.BURN]: [`The flames consuming ${targetName} sputter out.`],
      [StatusEffectType.SHIELD]: [`${targetName}'s magical barrier dissipates.`],
      [StatusEffectType.HASTE]: [`The haste effect on ${targetName} wears off.`],
    };
    return pick(phrases[effectType] ?? [`The effect on ${targetName} fades.`]);
  },

  roomEntry(roomName: string, description: string): string {
    return `You enter ${roomName}. ${description}`;
  },

  roomAlreadyExplored(roomName: string): string {
    return `You return to ${roomName}.`;
  },

  moveBlocked(): string {
    const phrases = [
      "Enemies block the path. There is no escape — face them or fall!",
      "You cannot flee. The enemies stand between you and the exit.",
      "Every exit is blocked. Defeat your foes first!",
    ];
    return pick(phrases);
  },

  noExit(direction: Direction): string {
    return `You head ${direction}, but solid stone wall stops you cold. No path that way.`;
  },

  combatStart(enemies: Enemy[]): string {
    const names = enemies.map((e) => e.name).join(" and ");
    const intros = [
      `Combat begins! You face ${names}. Steel yourself!`,
      `The dungeon erupts — ${names} attack! Ready your weapons!`,
      `${names} emerges from the shadows — battle is joined!`,
    ];
    return pick(intros);
  },

  combatVictory(): string {
    const phrases = [
      "Victory! The last enemy crumbles. The dungeon falls silent once more.",
      "Your foes are vanquished. A moment of silence in the dark.",
      "All enemies are defeated. You breathe heavily, victorious.",
    ];
    return pick(phrases);
  },

  treasureFound(description: string, gold: number): string {
    if (gold > 0) return `${description} You also find ${gold} gold coins glinting in the dust.`;
    return description;
  },

  trapTriggered(damage: number): string {
    const phrases = [
      `A hidden pressure plate clicks — darts shoot from the walls! You take ${damage} damage!`,
      `The floor gives way for a split second — spikes graze you for ${damage} damage!`,
      `A tripwire snaps and releases a swinging blade — ${damage} damage!`,
    ];
    return pick(phrases);
  },

  trapAvoided(): string {
    const phrases = [
      "You notice the glint of a pressure plate and step carefully around it.",
      "Sharp eyes catch a tripwire in time. You step over it safely.",
    ];
    return pick(phrases);
  },

  itemPickedUp(itemName: string): string {
    return `You pick up the ${itemName} and add it to your pack.`;
  },

  itemUsed(playerName: string, itemName: string, effect: string): string {
    return `${playerName} uses the ${itemName}. ${effect}`;
  },

  levelUp(player: Player): string {
    return (
      `Brilliant light washes over ${player.name} — LEVEL UP! ` +
      `Now level ${player.level}. ` +
      `HP +15 | MP +10 | ATK +3 | DEF +2.`
    );
  },

  xpGained(amount: number): string {
    return `You gain ${amount} experience.`;
  },

  goldGained(amount: number): string {
    return `You pocket ${amount} gold.`;
  },

  enemyTurn(enemy: Enemy, damage: number): string {
    const phrases: Record<EnemyType, string[]> = {
      [EnemyType.GOBLIN]: [
        `The ${enemy.name} darts forward and slashes you for ${damage} damage!`,
        `Cackling, the ${enemy.name} bites at you — ${damage} damage!`,
      ],
      [EnemyType.MAGE]: [
        `The ${enemy.name} chants a hasty hex — arcane energy strikes for ${damage} damage!`,
        `A bolt of dark magic erupts from the ${enemy.name} and slams into you — ${damage} damage!`,
      ],
      [EnemyType.TANK]: [
        `The ${enemy.name} charges with a bone-crushing blow for ${damage} damage!`,
        `The ${enemy.name} raises its weapon and smashes you for ${damage} damage!`,
      ],
      [EnemyType.SKELETON]: [
        `The ${enemy.name}'s bony claws rake across you — ${damage} damage!`,
        `The ${enemy.name} rattles forward and strikes you for ${damage} damage!`,
      ],
      [EnemyType.BOSS]: [
        `The ${enemy.name} unleashes a devastating strike for ${damage} damage!`,
        `With a thunderous roar, ${enemy.name} smashes you for ${damage} damage!`,
      ],
    };
    return pick(phrases[enemy.type] ?? [`The ${enemy.name} attacks you for ${damage} damage!`]);
  },

  noTarget(abilityName: string): string {
    return `You try to cast ${abilityName}, but there's no valid target in range.`;
  },

  fleeSuccess(direction: Direction): string {
    return `You break away from combat and sprint ${direction}!`;
  },

  fleeFailed(): string {
    const phrases = [
      "You bolt for the exit — but the enemies cut you off!",
      "Your retreat is blocked. You must fight your way out!",
    ];
    return pick(phrases);
  },
};
