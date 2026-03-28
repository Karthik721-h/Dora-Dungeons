import { RoomEvent, EventType, Player } from "../types/index.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";

export interface EventResult {
  narration: string[];
  combatTriggered: boolean;
  goldGained: number;
  itemFound?: import("../types/index.js").Item;
  damageDealt: number;
}

export function triggerRoomEvent(event: RoomEvent, player: Player): EventResult {
  const result: EventResult = {
    narration: [],
    combatTriggered: false,
    goldGained: 0,
    damageDealt: 0,
  };

  if (event.triggered) return result;
  event.triggered = true;

  switch (event.type) {
    case EventType.COMBAT: {
      if (event.enemies && event.enemies.length > 0) {
        result.combatTriggered = true;
        result.narration.push(NarrationEngine.combatStart(event.enemies));
      }
      break;
    }

    case EventType.TREASURE: {
      const gold = event.goldReward ?? 0;
      result.goldGained = gold;
      const item = event.itemReward;
      if (item) {
        result.itemFound = item;
        result.narration.push(
          NarrationEngine.treasureFound(
            event.storyText ?? `You discover a glinting treasure chest. Inside lies a ${item.name}!`,
            gold
          )
        );
      } else if (gold > 0) {
        result.narration.push(
          NarrationEngine.treasureFound(
            event.storyText ?? "You spot a small cache of coins tucked in a crevice.",
            gold
          )
        );
      } else if (event.storyText) {
        result.narration.push(event.storyText);
      }
      break;
    }

    case EventType.TRAP: {
      const damage = event.trapDamage ?? 0;
      const dodgeChance = player.speed >= 12 ? 0.4 : 0.2;
      if (Math.random() < dodgeChance) {
        result.narration.push(NarrationEngine.trapAvoided());
      } else {
        result.damageDealt = damage;
        player.hp = Math.max(0, player.hp - damage);
        result.narration.push(NarrationEngine.trapTriggered(damage));
        result.narration.push(`You now have ${player.hp}/${player.maxHp} HP.`);
      }
      break;
    }

    case EventType.STORY: {
      if (event.storyText) {
        result.narration.push(event.storyText);
      }
      break;
    }

    case EventType.EMPTY:
    default:
      break;
  }

  return result;
}
