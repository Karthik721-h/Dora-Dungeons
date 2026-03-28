import { RoomEvent, EventType, Player, Item } from "../types/index.js";
import { NarrationEngine } from "../narration/NarrationEngine.js";

export interface EventResult {
  narration: string[];
  combatTriggered: boolean;
  goldGained: number;
  itemFound?: Item;
  damageDealt: number;
}

type EventHandler = (event: RoomEvent, player: Player) => EventResult;

const handlers = new Map<EventType, EventHandler>();

export const EventRegistry = {
  register(type: EventType, handler: EventHandler): void {
    handlers.set(type, handler);
  },

  trigger(event: RoomEvent, player: Player): EventResult {
    if (event.triggered) {
      return { narration: [], combatTriggered: false, goldGained: 0, damageDealt: 0 };
    }

    event.triggered = true;

    const handler = handlers.get(event.type);
    if (!handler) {
      return { narration: [], combatTriggered: false, goldGained: 0, damageDealt: 0 };
    }

    return handler(event, player);
  },
};

EventRegistry.register(EventType.COMBAT, (event) => {
  const enemies = (event.enemies ?? []).filter((e) => !e.isDefeated);
  if (enemies.length === 0) {
    return { narration: [], combatTriggered: false, goldGained: 0, damageDealt: 0 };
  }
  return {
    narration: [NarrationEngine.combatStart(enemies)],
    combatTriggered: true,
    goldGained: 0,
    damageDealt: 0,
  };
});

EventRegistry.register(EventType.TREASURE, (event) => {
  const gold = event.goldReward ?? 0;
  const item = event.itemReward;
  const narration: string[] = [];

  if (item) {
    narration.push(NarrationEngine.treasureFound(item.name, gold));
  } else if (event.storyText) {
    narration.push(event.storyText);
    if (gold > 0) narration.push(NarrationEngine.goldGained(gold));
  }

  return {
    narration,
    combatTriggered: false,
    goldGained: gold,
    itemFound: item,
    damageDealt: 0,
  };
});

EventRegistry.register(EventType.TRAP, (event, player) => {
  const damage = event.trapDamage ?? 0;
  const dodgeChance = player.speed >= 12 ? 0.4 : 0.2;

  if (Math.random() < dodgeChance) {
    return {
      narration: [NarrationEngine.trapAvoided()],
      combatTriggered: false,
      goldGained: 0,
      damageDealt: 0,
    };
  }

  player.hp = Math.max(0, player.hp - damage);
  return {
    narration: [
      NarrationEngine.trapTriggered(damage),
      `You now have ${player.hp}/${player.maxHp} HP.`,
    ],
    combatTriggered: false,
    goldGained: 0,
    damageDealt: damage,
  };
});

EventRegistry.register(EventType.STORY, (event) => ({
  narration: event.storyText ? [event.storyText] : [],
  combatTriggered: false,
  goldGained: 0,
  damageDealt: 0,
}));

EventRegistry.register(EventType.EMPTY, () => ({
  narration: [],
  combatTriggered: false,
  goldGained: 0,
  damageDealt: 0,
}));

export function triggerRoomEvent(event: RoomEvent, player: Player): EventResult {
  return EventRegistry.trigger(event, player);
}
