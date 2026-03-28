/**
 * EventSystem
 *
 * Thin re-export of EventRegistry.
 * All event logic lives in registries/EventRegistry.ts.
 * This file exists so existing imports stay valid.
 */
export { EventRegistry } from "../registries/EventRegistry.js";
export type { EventResult } from "../registries/EventRegistry.js";

import { RoomEvent, Player } from "../types/index.js";
import { EventRegistry } from "../registries/EventRegistry.js";
import type { EventResult } from "../registries/EventRegistry.js";

export function triggerRoomEvent(event: RoomEvent, player: Player): EventResult {
  return EventRegistry.trigger(event, player);
}
