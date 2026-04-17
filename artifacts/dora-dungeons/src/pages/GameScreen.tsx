import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useProcessAction, GameStateResponse, customFetch, type ArmorState } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";
import {
  Map, Skull, TerminalSquare, Volume2, VolumeX, Plus, Minus,
  Eye, Info, LogOut, Swords, ChevronDown, ShoppingBag, Trash2,
} from "lucide-react";

import { AudioManager } from "@/audio/AudioManager";
import { processIntent, directionToPan } from "@/audio/IntentProcessor";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { NarrationFeed } from "@/components/NarrationFeed";
import { PlayerHUD } from "@/components/PlayerHUD";
import { VoiceControl } from "@/components/VoiceControl";
import { ShopPanel, ShopView, ShopBuyResult, ShopSellResult, ShopUpgradeResult } from "@/components/ShopPanel";
import { GameModal, ModalButton } from "@/components/GameModal";
import { ShopWeapon, ShopArmor, ShopInventoryItem, SHOP_WEAPONS } from "@/shop";
import {
  speakShopOpen,
  speakShopExit,
  speakWeaponList,
  speakPurchaseSuccess,
  speakPurchaseFail,
  speakSellList,
  speakSellSuccess,
  speakSellEmpty,
  speakArmorList,
  speakUpgradeSuccess,
  speakUpgradeFail,
  speakUpgradeMax,
  speakNoArmor,
  speakShopNoMatch,
} from "@/audio/ShopNarration";

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractDirection(cmd: string): string | null {
  const m = cmd.match(/^move\s+(north|south|east|west|up|down)$/);
  return m ? m[1]! : null;
}

/**
 * Build a short, natural TTS announcement of available exits.
 * Always spoken after narration so visually impaired users always
 * know where they can go without needing to ask.
 */
function buildExitsAnnouncement(exits: Record<string, string>): string {
  const dirs = Object.keys(exits);
  if (dirs.length === 0) return "There are no exits from this room.";
  if (dirs.length === 1) return `The only exit is to the ${dirs[0]}.`;
  const last = dirs[dirs.length - 1]!;
  const rest = dirs.slice(0, -1).join(", ");
  return `Exits: ${rest} and ${last}.`;
}

/** True if the exits line is already inside the spoken narration lines */
function exitsAlreadySpoken(lines: string[]): boolean {
  return lines.some(l => /^exits:/i.test(l.trim()));
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GameScreen({
  gameState,
  onLogout,
  onDeleteAccount,
}: {
  gameState: GameStateResponse;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
}) {
  const [command, setCommand] = useState("");
  const [speechRate, setSpeechRateState] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSpeaking, setAudioSpeaking] = useState(false);
  const [intentHint, setIntentHint] = useState<string | null>(null);
  const [newFromIndex, setNewFromIndex] = useState(gameState.logs.length);
  const [voiceGender, setVoiceGender] = useState<"female" | "male">(() => AudioManager.getVoiceGender());
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);

  // ── Shop state — backed by server state (player.weapons / player.inventoryItems) ──
  const [shopOpen, setShopOpen] = useState(false);
  const [shopMode, setShopMode] = useState<"main" | "buy" | "sell" | "upgrade">("main");

  // ── Death / restart state ────────────────────────────────────────────────────
  const [restartPending, setRestartPending] = useState(false);
  // Guards against re-speaking the death TTS on subsequent renders.
  const deathTtsSpokenRef = useRef(false);

  // ── Level progression decision state ─────────────────────────────────────────
  // "explore"       → normal gameplay
  // "levelDecision" → boss defeated, asking "next level or replay?"
  // "replayPrompt"  → player chose no, asking "replay or exit?"
  const [gameMode, setGameMode] = useState<"explore" | "levelDecision" | "replayPrompt">("explore");
  const [progressionPending, setProgressionPending] = useState(false);

  // Gold comes directly from gameState.gold — no separate shopGold state.
  const [shopWeapons, setShopWeapons] = useState<ShopWeapon[]>(() =>
    (gameState.player.weapons ?? []) as ShopWeapon[]
  );
  const [shopArmors, setShopArmors] = useState<ShopArmor[]>(() =>
    (gameState.player.armors ?? []) as ShopArmor[]
  );
  const [shopItems, setShopItems] = useState<ShopInventoryItem[]>(() =>
    (gameState.player.inventoryItems ?? []) as ShopInventoryItem[]
  );
  const [shopExtraLogs, setShopExtraLogs] = useState<string[]>([]);
  // Client-side messages (unknown command feedback) shown in the terminal
  // without requiring a backend round-trip.
  const [localExtraLogs, setLocalExtraLogs] = useState<string[]>([]);

  // Refs so submitCommand (a useCallback) always sees fresh shop state
  const shopOpenRef    = useRef(shopOpen);
  const shopModeRef    = useRef(shopMode);
  // No shopGoldRef — gold is read from gameStateRef.current.gold
  const shopWeaponsRef = useRef(shopWeapons);
  const shopArmorsRef  = useRef(shopArmors);
  const shopItemsRef   = useRef(shopItems);

  const prevLogsRef             = useRef<string[]>(gameState.logs);
  const isMutedRef              = useRef(isMuted);
  const gameStateRef            = useRef(gameState);
  // Set to true when an unknown command is caught client-side so onSuccess
  // knows to skip the backend's "Unknown command:" narration (already spoken).
  const unknownHandledLocallyRef = useRef(false);
  const queryClient = useQueryClient();
  const stopListeningRef    = useRef<() => void>(() => {});
  const startListeningRef   = useRef<() => void>(() => {});
  const gameModeRef         = useRef<"explore" | "levelDecision" | "replayPrompt">("explore");
  const onLogoutRef = useRef(onLogout);
  const voiceGenderRef = useRef(voiceGender);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);
  const voiceButtonRef  = useRef<HTMLButtonElement>(null);
  const voiceMenuRef    = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  // Captured after mount so createPortal always gets a real DOM node.
  const [portalContainer, setPortalContainer] = useState<Element | null>(null);

  useEffect(() => {
    AudioManager.onStateChange(setAudioSpeaking);
  }, []);

  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  // ── Auto-start voice ───────────────────────────────────────────────────────
  // Runs exactly once on mount. Detects whether this is a brand-new game or a
  // session restore so it can give the player the right opening narration.
  //
  //  • VICTORY  → VICTORY recovery effect handles all TTS (skip here)
  //  • GAME_OVER → death TTS effect handles all TTS (skip here)
  //  • New game (turnCount === 0) → welcome + starting room description
  //  • Restore + EXPLORING → "Resuming your adventure" + room + exits
  //  • Restore + IN_COMBAT  → "Resuming your adventure" + combat summary
  //
  // isHydratingRef stays true until the opening narration drains, at which
  // point it flips to false. The onSuccess handler checks this flag before
  // calling speakLines so terminal-log narration never fires during the
  // initial load window.
  const hasAutoStartedRef = useRef(false);
  const isHydratingRef    = useRef(true);
  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    // When audio is off (muted or not supported), collapse the hydration window
    // immediately so subsequent command narration isn't permanently blocked.
    if (isMuted || !voiceSupported) {
      isHydratingRef.current = false;
      return;
    }
    if (!gameState.logs.length) return;
    // VICTORY and GAME_OVER have their own dedicated TTS effects
    if (
      gameState.gameStatus === "VICTORY" ||
      gameState.gameStatus === "GAME_OVER"
    ) {
      isHydratingRef.current = false;
      return;
    }
    hasAutoStartedRef.current = true;

    const isRestore = (gameState.turnCount ?? 0) > 0;
    const room = gameState.currentRoom;

    const t = setTimeout(() => {
      AudioManager.stopAll();
      if (!isRestore) {
        // ── New game ────────────────────────────────────────────────────────
        // Speak welcome → room name + description → exits.
        // Terminal logs are intentionally omitted: new players hear only the
        // contextual dungeon state, not raw engine output.
        AudioManager.speak(
          "Welcome to Dora Dungeons. Voice control is active. Say help at any time to hear the list of commands."
        );
        AudioManager.speak(`${room.name}. ${room.description}`, { interrupt: false });
        AudioManager.speak(buildExitsAnnouncement(room.exits), { interrupt: false });
      } else if (gameState.gameStatus === "IN_COMBAT") {
        // ── Restore: mid-combat ────────────────────────────────────────────
        const living = room.enemies.filter(e => !e.isDefeated);
        const enemySummary = living.length > 0
          ? living.map(e => `${e.name} with ${e.hp} of ${e.maxHp} health`).join(", and ")
          : "unknown enemies";
        AudioManager.speak(
          `Resuming your adventure. You are in combat with ${enemySummary}. What will you do?`,
          { interrupt: true }
        );
      } else {
        // ── Restore: exploring ─────────────────────────────────────────────
        // Speak room name + description → exits only.
        // Terminal logs are intentionally omitted to avoid replaying stale
        // engine output to the player on refresh.
        AudioManager.speak(`${room.name}. ${room.description}`, { interrupt: true });
        AudioManager.speak(buildExitsAnnouncement(room.exits), { interrupt: false });
      }
      AudioManager.onQueueDrained(() => {
        isHydratingRef.current = false;
        if (!hasAutoStartedRef.current) return;
        startListening();
      });
    }, 700);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Death TTS — fire once when GAME_OVER is detected ────────────────────────
  const isGameOver = gameState.gameStatus === "GAME_OVER";
  useEffect(() => {
    if (!isGameOver) {
      deathTtsSpokenRef.current = false;
      return;
    }
    if (deathTtsSpokenRef.current) return;
    deathTtsSpokenRef.current = true;

    // Hard-stop everything in progress, then speak the death message at
    // critical priority so it always wins over any in-flight narration.
    AudioManager.stopAll();

    if (!isMutedRef.current) {
      AudioManager.speak(
        "You have fallen. Your quest ends here — for now. Say yes to restart this dungeon level from the start, keeping all your weapons, armor, and gold. Say no to exit.",
        { priority: "critical" }
      );
      // Once the death message finishes, force the mic active so the player
      // can immediately say "yes" or "no" without any extra tap.
      AudioManager.onQueueDrained(() => {
        stopListeningRef.current?.();       // stop any stale session first
        setTimeout(() => startListening(), 120); // restart fresh
      });
    } else {
      // Muted — no TTS, but still activate the mic immediately.
      stopListeningRef.current?.();
      setTimeout(() => startListening(), 120);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameOver]);

  // ── Mutation ────────────────────────────────────────────────────────────────
  const { mutate: sendAction, isPending } = useProcessAction({
    mutation: {
      onSuccess: (newData) => {
        queryClient.setQueryData(getGetGameStateQueryKey(), newData);
        setCommand("");
        setIntentHint(null);

        const prevLen = prevLogsRef.current.length;
        prevLogsRef.current = newData.logs;
        setNewFromIndex(prevLen);

        // Use newLogs from the server — the exact lines this command added.
        // Client-side diffing via getNewLogs() broke once cumulative logs
        // exceeded the 80-line display cap (both arrays were always length 80).
        const newLines: string[] = (newData.newLogs ?? []).filter(
          l => l.trim() && !l.startsWith(">")
        );

        // ── Death guard: block ALL narration when transitioning into GAME_OVER ──
        // The death TTS useEffect handles the only speech in this state.
        // Allowing combat/log narration here would overlap with the death message.
        const transitioningToDeath = newData.gameStatus === "GAME_OVER";
        // ── Hydration guard: skip log narration during the initial load window ──
        // isHydratingRef is true from mount until the opening narration finishes.
        // This prevents terminal logs from being spoken when the page first loads
        // (e.g. if a user submits a command in the brief window before TTS drains).
        if (!transitioningToDeath && !isMutedRef.current && !isHydratingRef.current && newLines.length > 0) {
          // When the engine returns an "Unknown command" response, replace the
          // verbose hint text with a single accessible prompt instead of reading
          // out the raw developer-facing command syntax.
          const isUnknownCommand = newLines.some(l => /^Unknown command:/i.test(l));

          // If the client already handled an unknown command locally (via
          // IntentProcessor's matched=false path), skip the backend narration so
          // we don't speak the same message twice.
          const alreadyHandled = unknownHandledLocallyRef.current && isUnknownCommand;
          unknownHandledLocallyRef.current = false; // always reset after checking

          if (!alreadyHandled) {
            const linesToSpeak = isUnknownCommand
              ? ["Say help to hear the available voice commands."]
              : newLines;
            AudioManager.speakLines(linesToSpeak, { interrupt: true });
          }
          // Queue exits after narration so visually impaired users always
          // know where they can go. Skip on VICTORY — the dungeon is cleared
          // and there are no meaningful exits to navigate at that point.
          if (!exitsAlreadySpoken(newLines) && newData.gameStatus !== "VICTORY") {
            AudioManager.speak(
              buildExitsAnnouncement(newData.currentRoom.exits),
              { interrupt: false }
            );
          }
        } else if (transitioningToDeath) {
          // Reset the unknown-command flag so it doesn't leak into the restart
          unknownHandledLocallyRef.current = false;
        }
        if (!transitioningToDeath && !isMutedRef.current) {
          if (newData.gameStatus === "IN_COMBAT" && gameStateRef.current.gameStatus !== "IN_COMBAT") {
            AudioManager.playCombatAlert();
          }
          // Fire chime only on genuine XP gain — "experience" appears in XP
          // award log lines. The old "level" check was too broad and fired
          // incorrectly on the boss-defeat stat summary ("Final Level: ...").
          if (newLines.some(l => l.toLowerCase().includes("experience"))) {
            AudioManager.playRewardChime();
          }
          // ── Dungeon level completion → progression decision ───────────────────
          if (newData.event === "LEVEL_COMPLETED") {
            gameModeRef.current = "levelDecision";
            setGameMode("levelDecision");
            if (!isMutedRef.current) {
              AudioManager.speak(
                `Congratulations! Dungeon level ${newData.player.dungeonLevel} complete. You defeated the boss. Would you like to advance to the next level? Say yes to continue, or say no to replay the dungeon.`,
                { interrupt: true }
              );
              AudioManager.onQueueDrained(() => {
                stopListeningRef.current?.();
                setTimeout(() => startListeningRef.current(), 120);
              });
            }
          }
        }
      },
    },
  });

  // ── Shared name-matching helpers ─────────────────────────────────────────────
  // Lifted to component scope so both submitCommand and the voice handler share them.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const fuzzyMatch = (spoken: string, name: string) => {
    const sp = norm(spoken);
    const nm = norm(name);
    return nm.includes(sp) || sp.includes(nm);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submitCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || isPending) return;

      if (trimmed === "repeat") {
        AudioManager.repeatLast();
        return;
      }

      if (trimmed === "logout") {
        stopListeningRef.current();
        AudioManager.speak(
          "You have been logged out successfully. Please log in again to continue your adventure.",
          { interrupt: true }
        );
        AudioManager.onQueueDrained(() => {
          onLogoutRef.current?.();
        });
        return;
      }

      // ── Level progression decision handlers ──────────────────────────────────
      if (trimmed === "next_level") {
        nextLevelApi();
        return;
      }

      if (trimmed === "replay_prompt") {
        // Transition to the second decision sub-state.
        gameModeRef.current = "replayPrompt";
        setGameMode("replayPrompt");
        if (!isMutedRef.current) {
          AudioManager.speak(
            "Would you like to explore this level again? Say yes to restart this level from the start, or no to exit the dungeon.",
            { interrupt: true }
          );
        }
        return;
      }

      if (trimmed === "replay_level") {
        replayLevelApi();
        return;
      }

      // ── Death mode: only yes/no accepted ────────────────────────────────────
      if (trimmed === "restart_level") {
        restartApi();
        return;
      }

      if (trimmed === "exit_to_login") {
        stopListeningRef.current();
        AudioManager.speak(
          "You have exited the dungeon. Return when you are ready.",
          { interrupt: true }
        );
        AudioManager.onQueueDrained(() => { onLogoutRef.current?.(); });
        return;
      }

      if (trimmed === "change_voice") {
        const newGender: "female" | "male" = voiceGenderRef.current === "female" ? "male" : "female";
        try {
          AudioManager.setVoiceGender(newGender);
          setVoiceGender(newGender);
          const msg =
            newGender === "male"
              ? "Switched to male narrator voice."
              : "Switched to female narrator voice.";
          AudioManager.speak(msg, { interrupt: true });
        } catch {
          AudioManager.speak("I was unable to change the voice. Please try again.", { interrupt: true });
        }
        return;
      }

      // ── Shop voice commands ────────────────────────────────────────────────────

      if (trimmed === "open_shop") {
        setShopOpen(true);
        setShopMode("main");
        if (!isMutedRef.current) speakShopOpen();
        return;
      }

      if (trimmed === "exit_shop") {
        setShopOpen(false);
        setShopMode("main");
        if (!isMutedRef.current) speakShopExit();
        return;
      }

      if (trimmed === "shop_buy") {
        if (!shopOpenRef.current) { setShopOpen(true); }
        setShopMode("buy");
        if (!isMutedRef.current) speakWeaponList(SHOP_WEAPONS);
        return;
      }

      if (trimmed === "shop_sell") {
        if (!shopOpenRef.current) { setShopOpen(true); }
        setShopMode("sell");
        if (!isMutedRef.current) {
          if (shopItemsRef.current.length === 0) {
            speakSellEmpty();
          } else {
            speakSellList(shopItemsRef.current);
          }
        }
        return;
      }

      if (trimmed === "shop_upgrade") {
        if (!shopOpenRef.current) { setShopOpen(true); }
        setShopMode("upgrade");
        if (!isMutedRef.current) {
          if (shopArmorsRef.current.length === 0) {
            speakNoArmor();
          } else {
            speakArmorList(shopArmorsRef.current);
          }
        }
        return;
      }

      // ── Context-aware name selection while shop is open ──────────────────────
      if (shopOpenRef.current && shopModeRef.current !== "main") {
        const mode = shopModeRef.current;

        if (mode === "buy") {
          const match = SHOP_WEAPONS.find((w) => fuzzyMatch(trimmed, w.name));
          if (match) {
            shopBuyApi(match.id).catch(() => { if (!isMutedRef.current) speakPurchaseFail(); });
            return;
          }
        }

        if (mode === "sell") {
          const match = shopItemsRef.current.find((i) => fuzzyMatch(trimmed, i.name));
          if (match) {
            shopSellApi(match.id).catch(() => { if (!isMutedRef.current) speakShopNoMatch(); });
            return;
          }
        }

        if (mode === "upgrade") {
          const match = shopArmorsRef.current.find((a) => fuzzyMatch(trimmed, a.name));
          if (match) {
            shopUpgradeApi(match.id).catch((e) => {
              if (!isMutedRef.current) {
                if (e?.message === "ARMOR_MAX_LEVEL") speakUpgradeMax();
                else speakUpgradeFail();
              }
            });
            return;
          }
        }

        // In shop but no name matched
        if (!isMutedRef.current) speakShopNoMatch();
        return;
      }

      // ── End shop commands ──────────────────────────────────────────────────────

      if (/^help$/i.test(trimmed)) {
        AudioManager.speakLines(
          [
            "Here are your voice commands.",
            "Say north, south, east, or west — to move through the dungeon.",
            "Say look — to hear your current room description and available exits.",
            "Say attack — to strike an enemy in your room.",
            "Say defend — to take a defensive stance and reduce incoming damage.",
            "Say cast fireball — to use a magic spell on an enemy.",
            "Say flee — to escape from combat and retreat.",
            "Say status — to hear your current health, mana, and level.",
            "Say repeat — to hear the last message again.",
            "Say open shop — to visit the merchant's shop.",
            "Say change voice — to switch between female and male narrator.",
            "Say log out — to exit the game and return to the login screen.",
            "Say help — to hear these commands again at any time.",
            "Exits are always announced after every action, so you always know where you can go.",
          ],
          { interrupt: true }
        );
        return;
      }

      if (trimmed === "look" || trimmed === "status") {
        sendAction({ data: { command: trimmed } });
        return;
      }

      const dir = extractDirection(trimmed);
      if (dir && !isMuted) {
        AudioManager.playDirectionalTone(directionToPan(dir), { frequency: 520, duration: 0.14 });
      }

      sendAction({ data: { command: trimmed } });
    },
    [isPending, isMuted, sendAction]
  );

  // ── Voice ───────────────────────────────────────────────────────────────────
  const {
    isSupported: voiceSupported,
    isListening,
    voiceState,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
  } = useVoiceInput({
    onFinalTranscript: (raw) => {
      if (/^(skip intro|skip|enter)$/i.test(raw.trim())) return;

      // ── Level progression decision mode: intercept before all other handlers ──
      // When the player has beaten the boss, only yes/no are valid inputs.
      // Route them based on which sub-state we're in (levelDecision / replayPrompt).
      if (gameModeRef.current !== "explore") {
        const normalized = raw.trim().toLowerCase();
        const isYes = /^(?:yes|yeah|yep|yup|sure|proceed|continue|advance|next|ok|okay|affirm|go|accept)$/.test(normalized);
        const isNo  = /^(?:no|nope|nah|cancel|decline|negative|stay|back|return|stop)$/.test(normalized);

        if (gameModeRef.current === "levelDecision") {
          const isNextLevel = /^next\s+level$/i.test(normalized);
          if (isYes || isNextLevel) {
            submitCommand("next_level");
          } else if (isNo) {
            submitCommand("replay_prompt");
          } else if (!isMutedRef.current) {
            AudioManager.speak(
              "Say yes to advance to the next level, or no for other options.",
              { interrupt: false }
            );
          }
        } else if (gameModeRef.current === "replayPrompt") {
          if (isYes) {
            submitCommand("replay_level");
          } else if (isNo) {
            submitCommand("exit_to_login");
          } else if (!isMutedRef.current) {
            AudioManager.speak(
              "Say yes to replay this level, or no to exit the dungeon.",
              { interrupt: false }
            );
          }
        }
        return;
      }

      // ── Death mode: only yes/no are valid; all else is silently dropped ──────
      if (gameStateRef.current.gameStatus === "GAME_OVER") {
        const { canonical } = processIntent(raw);
        if (canonical === "restart_level" || canonical === "exit_to_login") {
          submitCommand(canonical);
        } else if (!isMutedRef.current) {
          AudioManager.speak(
            "Say yes to restart or no to exit.",
            { interrupt: false }
          );
        }
        return;
      }

      const { canonical, wasNormalized, matched, suggestion } = processIntent(raw);
      setCommand(canonical);
      if (wasNormalized) setIntentHint(`"${raw}" → "${canonical}"`);
      else setIntentHint(null);

      // ── Shop context: bare item/armor/weapon names are valid commands ─────────
      // When the shop is open in buy / sell / upgrade mode, spoken names map
      // directly to the relevant action.  Bypass the "unknown command" path so
      // the player never hears an error when saying a valid shop name.
      if (!matched && shopOpenRef.current) {
        const mode = shopModeRef.current;

        if (mode === "buy") {
          const weaponHit = SHOP_WEAPONS.find((w) => fuzzyMatch(canonical, w.name));
          if (weaponHit) {
            submitCommand(canonical);
            return;
          }
        }

        if (mode === "sell") {
          const itemHit = shopItemsRef.current.find((i) => fuzzyMatch(canonical, i.name));
          if (itemHit) {
            submitCommand(canonical);
            return;
          }
        }

        if (mode === "upgrade") {
          const armorHit = shopArmorsRef.current.find((a) => fuzzyMatch(canonical, a.name));
          if (armorHit) {
            submitCommand(canonical);
            return;
          }
        }
      }

      // ── Unknown command: no intent pattern matched ─────────────────────────
      // Give instant client-side feedback without an API round-trip.
      // We still fall through to submitCommand so the backend engine can attempt
      // to parse it (it may recognise commands the client-side patterns don't cover).
      if (!matched && !isMutedRef.current) {
        const spokenMsg = suggestion
          ? `Unknown command. Did you mean: ${suggestion}? Say help to hear all commands.`
          : "Unknown command. Say help to hear the available voice commands.";

        const terminalMsg = suggestion
          ? `Unknown command. Did you mean: ${suggestion}?`
          : "Unknown command. Say help to hear the available voice commands.";

        AudioManager.speak(spokenMsg, { interrupt: true });
        setLocalExtraLogs(prev => {
          setNewFromIndex(logs.length + shopExtraLogs.length + prev.length);
          return [...prev, terminalMsg];
        });
        // Flag so onSuccess skips the backend's duplicate "Unknown command" narration
        unknownHandledLocallyRef.current = true;
        // Still forward to backend — it may handle commands the client patterns miss
        submitCommand(canonical);
        return;
      }

      submitCommand(canonical);
    },
    onInterimTranscript: (interim) => setCommand(interim),
    onError: (err) => {
      AudioManager.speak(err, { interrupt: false });
    },
  });

  // Keep refs fresh so submitCommand (a useCallback) always has current values
  stopListeningRef.current = stopListening;
  onLogoutRef.current = onLogout;
  voiceGenderRef.current = voiceGender;
  isMutedRef.current = isMuted;
  gameStateRef.current = gameState;
  shopOpenRef.current    = shopOpen;
  shopModeRef.current    = shopMode;
  shopWeaponsRef.current = shopWeapons;
  shopArmorsRef.current  = shopArmors;
  shopItemsRef.current   = shopItems;
  gameModeRef.current    = gameMode;
  startListeningRef.current = startListening;

  // True whenever any modal is covering the screen — used to visually disable
  // all interactive controls that sit behind the portal overlay.
  const isModalOpen = isGameOver || gameMode !== "explore";

  // ── Restore decision mode if the page was refreshed during a VICTORY ────────
  // gameMode is React state and resets to "explore" on every mount. If the DB
  // still has gameStatus === "VICTORY" (boss was killed but no choice was made),
  // re-enter levelDecision so the player isn't stuck.
  useEffect(() => {
    if (gameState.gameStatus !== "VICTORY") return;
    gameModeRef.current = "levelDecision";
    setGameMode("levelDecision");
    if (!isMutedRef.current) {
      AudioManager.speak(
        "Congratulations. You have completed this level. Would you like to continue to the next level? Say yes to advance, or no for other options.",
        { interrupt: true }
      );
      AudioManager.onQueueDrained(() => {
        stopListeningRef.current?.();
        setTimeout(() => startListeningRef.current(), 120);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional empty array — runs exactly once on mount

  // ── Click-outside: close voice dropdown ──────────────────────────────────────
  // Check both the trigger container AND the portaled menu (rendered in document.body).
  useEffect(() => {
    if (!voiceDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = voiceDropdownRef.current?.contains(target) ?? false;
      const insideMenu    = voiceMenuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) {
        setVoiceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [voiceDropdownOpen]);

  // ── Voice gender helper ──────────────────────────────────────────────────────
  const handleVoiceSelect = (gender: "female" | "male") => {
    setVoiceDropdownOpen(false);
    if (gender === voiceGenderRef.current) return;
    try {
      AudioManager.setVoiceGender(gender);
      setVoiceGender(gender);
      const msg =
        gender === "male"
          ? "Voice changed to male narrator."
          : "Voice changed to female narrator.";
      AudioManager.speak(msg, { interrupt: true });
    } catch {
      AudioManager.speak("I was unable to change the voice. Please try again.", { interrupt: true });
    }
  };

  // ── Rate / mute ─────────────────────────────────────────────────────────────
  const adjustRate = (delta: number) => {
    const next = Math.max(0.5, Math.min(2.0, +(speechRate + delta).toFixed(1)));
    setSpeechRateState(next);
    AudioManager.setSpeechRate(next);
    if (!isMuted) AudioManager.speak(`Speed: ${next}`, { interrupt: true });
  };

  const toggleMute = () => {
    if (!isMuted) {
      AudioManager.stop();
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const { player, currentRoom, logs, gameStatus, parsedCommand } = gameState;
  const isCombat = gameStatus === "IN_COMBAT";

  // Merge server logs with any shop action messages AND client-side feedback
  // (e.g. unknown command notices) so they all appear in the terminal.
  const displayLogs = [
    ...logs,
    ...shopExtraLogs,
    ...localExtraLogs,
  ];

  /** Append a shop action result to the terminal log feed. */
  const addShopLog = (msg: string) => {
    setShopExtraLogs(prev => {
      setNewFromIndex(logs.length + prev.length);
      return [...prev, `[SHOP] ${msg}`];
    });
  };

  /**
   * Patch only the player's gold in the React Query cache so that
   * gameState.gold — the single source of truth — reflects the
   * updated value immediately without a full refetch.
   */
  const patchPlayerGold = (gold: number) => {
    queryClient.setQueryData(
      getGetGameStateQueryKey(),
      (old: typeof gameState | undefined) =>
        old ? { ...old, gold, player: { ...old.player, gold } } : old
    );
  };

  /** Patch the full player shape in the cache after a shop operation. */
  const patchPlayerFromShopResponse = (resp: { gold: number; player: GameStateResponse["player"] }) => {
    queryClient.setQueryData(
      getGetGameStateQueryKey(),
      (old: typeof gameState | undefined) =>
        old ? { ...old, gold: resp.gold, player: resp.player } : old
    );
    setShopWeapons((resp.player.weapons ?? []) as ShopWeapon[]);
    setShopArmors((resp.player.armors ?? []) as ShopArmor[]);
    setShopItems((resp.player.inventoryItems ?? []) as ShopInventoryItem[]);
  };

  // ── Restart API (death → same level) ──────────────────────────────────────
  const restartApi = async () => {
    if (restartPending) return;
    setRestartPending(true);
    try {
      const data = await customFetch<GameStateResponse>(
        `${import.meta.env.BASE_URL}api/game/restart`,
        { method: "POST" }
      );
      // Flush local log buffers and sync cache with fresh server state
      setShopExtraLogs([]);
      setLocalExtraLogs([]);
      deathTtsSpokenRef.current = false;
      setShopOpen(false);
      setShopMode("main");
      setGameMode("explore");
      queryClient.setQueryData(getGetGameStateQueryKey(), data);
      AudioManager.speak(
        "You rise again at the beginning of the dungeon. Your weapons, armor, and gold are intact. Stay vigilant.",
        { interrupt: true }
      );
    } catch {
      AudioManager.speak("Something went wrong. Please try again.", { interrupt: true });
    } finally {
      setRestartPending(false);
    }
  };

  // ── Room narration helper — called after level transitions ──────────────────
  // setQueryData bypasses onSuccess, so narration must be triggered manually.
  const speakRoomNarration = (room: GameStateResponse["currentRoom"]) => {
    if (isMutedRef.current) return;
    const lines: string[] = [];
    lines.push(`You enter ${room.name}. ${room.description}`);
    const exitKeys = Object.keys(room.exits);
    if (exitKeys.length > 0) {
      lines.push(buildExitsAnnouncement(room.exits));
    }
    if (room.items && room.items.length > 0) {
      const itemList = room.items.join(", ");
      lines.push(`Items on the floor: ${itemList}.`);
    }
    AudioManager.speakLines(lines, { interrupt: false });
  };

  // ── Next Level API (VICTORY → advance to next dungeon) ────────────────────
  const nextLevelApi = async () => {
    if (progressionPending) return;
    setProgressionPending(true);
    try {
      const data = await customFetch<GameStateResponse>(
        `${import.meta.env.BASE_URL}api/game/next-level`,
        { method: "POST" }
      );
      setShopExtraLogs([]);
      setLocalExtraLogs([]);
      setShopOpen(false);
      setShopMode("main");
      gameModeRef.current = "explore";
      setGameMode("explore");
      queryClient.setQueryData(getGetGameStateQueryKey(), data);
      AudioManager.speak(
        `Entering dungeon level ${data.player.dungeonLevel}. A new dungeon awaits. Prepare yourself.`,
        { interrupt: true }
      );
      speakRoomNarration(data.currentRoom);
      AudioManager.onQueueDrained(() => {
        stopListeningRef.current?.();
        setTimeout(() => startListeningRef.current(), 120);
      });
    } catch {
      AudioManager.speak("Something went wrong entering the next level. Please try again.", { interrupt: true });
      AudioManager.onQueueDrained(() => {
        stopListeningRef.current?.();
        setTimeout(() => startListeningRef.current(), 120);
      });
    } finally {
      setProgressionPending(false);
    }
  };

  // ── Replay Level API (VICTORY → restart same dungeon) ─────────────────────
  const replayLevelApi = async () => {
    if (progressionPending) return;
    setProgressionPending(true);
    try {
      const data = await customFetch<GameStateResponse>(
        `${import.meta.env.BASE_URL}api/game/replay-level`,
        { method: "POST" }
      );
      setShopExtraLogs([]);
      setLocalExtraLogs([]);
      setShopOpen(false);
      setShopMode("main");
      gameModeRef.current = "explore";
      setGameMode("explore");
      queryClient.setQueryData(getGetGameStateQueryKey(), data);
      AudioManager.speak(
        "You return to the start of this level. The dungeon awaits. Good luck.",
        { interrupt: true }
      );
      speakRoomNarration(data.currentRoom);
      AudioManager.onQueueDrained(() => {
        stopListeningRef.current?.();
        setTimeout(() => startListeningRef.current(), 120);
      });
    } catch {
      AudioManager.speak("Something went wrong. Please try again.", { interrupt: true });
      AudioManager.onQueueDrained(() => {
        stopListeningRef.current?.();
        setTimeout(() => startListeningRef.current(), 120);
      });
    } finally {
      setProgressionPending(false);
    }
  };

  // ── Shop API handlers ─────────────────────────────────────────────────────

  const shopBuyApi = async (weaponId: string): Promise<ShopBuyResult> => {
    const resp = await customFetch<{ success: boolean; message: string; gold: number; player: GameStateResponse["player"] }>(
      "/api/game/shop/buy",
      { method: "POST", body: JSON.stringify({ weaponId }), headers: { "Content-Type": "application/json" } }
    );
    patchPlayerFromShopResponse(resp);
    const weaponName = SHOP_WEAPONS.find(w => w.id === weaponId)?.name ?? weaponId;
    if (resp.success) {
      if (!isMutedRef.current) speakPurchaseSuccess(weaponName, resp.gold);
      addShopLog(`✓ ${weaponName} purchased.`);
    } else {
      if (!isMutedRef.current) speakPurchaseFail();
      addShopLog(`✗ ${resp.message}`);
    }
    return { success: resp.success, message: resp.message, gold: resp.gold, weapons: (resp.player.weapons ?? []) as ShopWeapon[] };
  };

  const shopSellApi = async (itemId: string): Promise<ShopSellResult> => {
    const resp = await customFetch<{ success: boolean; message: string; gold: number; player: GameStateResponse["player"] }>(
      "/api/game/shop/sell",
      { method: "POST", body: JSON.stringify({ itemId }), headers: { "Content-Type": "application/json" } }
    );
    patchPlayerFromShopResponse(resp);
    const itemName = shopItemsRef.current.find(i => i.id === itemId)?.name ?? itemId;
    if (resp.success) {
      if (!isMutedRef.current) speakSellSuccess(itemName, resp.gold);
      addShopLog(`✓ ${itemName} sold.`);
    } else {
      if (!isMutedRef.current) speakShopNoMatch();
      addShopLog(`✗ ${resp.message}`);
    }
    return { success: resp.success, message: resp.message, gold: resp.gold, items: (resp.player.inventoryItems ?? []) as ShopInventoryItem[] };
  };

  const shopUpgradeApi = async (armorId: string): Promise<ShopUpgradeResult> => {
    const resp = await customFetch<{ success: boolean; message: string; gold: number; player: GameStateResponse["player"] }>(
      "/api/game/shop/upgrade",
      { method: "POST", body: JSON.stringify({ armorId }), headers: { "Content-Type": "application/json" } }
    );
    patchPlayerFromShopResponse(resp);
    const armor = (resp.player.armors ?? []).find((a: ArmorState) => a.id === armorId);
    if (resp.success) {
      if (!isMutedRef.current) speakUpgradeSuccess(armor?.name ?? armorId, armor?.level ?? 0, resp.gold);
      addShopLog(`✓ ${armor?.name ?? armorId} upgraded to level ${armor?.level}.`);
    } else {
      if (!isMutedRef.current) {
        if (resp.message === "ARMOR_MAX_LEVEL") speakUpgradeMax();
        else speakUpgradeFail();
      }
      addShopLog(`✗ ${resp.message}`);
    }
    return { success: resp.success, message: resp.message, gold: resp.gold, armors: (resp.player.armors ?? []) as ShopArmor[] };
  };

  const audioState: "idle" | "listening" | "speaking" | "processing" =
    voiceState === "speaking" || audioSpeaking ? "speaking"
    : voiceState === "processing" ? "processing"
    : voiceState === "listening" ? "listening"
    : "idle";

  // Status badge colors
  const statusStyle = isCombat
    ? { border: "rgba(139,30,30,0.7)", color: "#f87171", bg: "rgba(139,30,30,0.18)" }
    : isGameOver
    ? { border: "rgba(239,68,68,0.6)", color: "#ef4444", bg: "rgba(239,68,68,0.12)" }
    : { border: "rgba(200,155,60,0.4)", color: "#c89b3c", bg: "rgba(200,155,60,0.08)" };

  const activeEnemies = currentRoom.enemies.filter(e => !e.isDefeated);

  return (
    <div className="relative flex flex-col h-screen w-full overflow-hidden" style={{ background: "#0b0f14" }}>

      {/* ── Background ── */}
      <div className="dungeon-bg" />

      {/* ── Atmospheric ── */}
      <div className="vignette" />
      {isCombat && <div className="combat-overlay" />}
      <div className="scanline-overlay" />

      {/* ══════════════ NAVBAR ══════════════ */}
      <header className="dd-navbar">
        {/* Left: logo + title */}
        <div className="dd-navbar-brand">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Dora Dungeons"
            style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
          />
          <span className="dd-navbar-title hidden sm:block">Dora Dungeons</span>
        </div>

        {/* Center: game status + dungeon level */}
        <div className="dd-navbar-center min-w-0">
          <span
            className="status-badge"
            style={{
              borderColor: statusStyle.border,
              color: statusStyle.color,
              background: statusStyle.bg,
              animation: isCombat ? "combat-breathe 2s infinite" : undefined,
            }}
          >
            {isCombat ? "⚔ In Combat" : isGameOver ? "☠ Fallen" : "◉ " + gameStatus.replace("_", " ")}
          </span>

          {/* Dungeon level badge — re-mounts (via key) on level-up to replay entrance animation */}
          <motion.span
            key={player.dungeonLevel ?? 1}
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            role="status"
            aria-live="polite"
            aria-label={`Current dungeon level ${player.dungeonLevel ?? 1}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#c89b3c",
              textShadow: "0 0 10px rgba(200,155,60,0.6)",
              border: "1px solid rgba(200,155,60,0.35)",
              background: "rgba(200,155,60,0.08)",
              borderRadius: 4,
              padding: "2px 8px",
            }}
          >
            ⬡ LVL {player.dungeonLevel ?? 1}
          </motion.span>
        </div>

        {/* Right: controls */}
        <div className="dd-navbar-controls">
          {/* Audio state indicator */}
          <span
            className="font-code hidden md:block"
            style={{
              fontSize: "10px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color:
                audioState === "listening" ? "rgba(248,113,113,0.7)"
                : audioState === "speaking" ? "rgba(58,134,255,0.7)"
                : audioState === "processing" ? "rgba(200,155,60,0.7)"
                : "rgba(200,190,180,0.2)",
            }}
          >
            {audioState === "listening" ? "● MIC"
              : audioState === "speaking" ? "● TTS"
              : audioState === "processing" ? "● …"
              : "○ idle"}
          </span>

          {/* Voice gender switcher */}
          <div ref={voiceDropdownRef}>
            <button
              ref={voiceButtonRef}
              onClick={() => {
                if (!voiceDropdownOpen && voiceButtonRef.current) {
                  const r = voiceButtonRef.current.getBoundingClientRect();
                  setDropdownPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                }
                setVoiceDropdownOpen(v => !v);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors hover:text-white"
              style={{
                fontSize: "10px",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(200,190,180,0.5)",
                border: "1px solid rgba(200,190,180,0.15)",
                background: voiceDropdownOpen ? "rgba(200,190,180,0.06)" : "transparent",
              }}
              aria-label="Change narrator voice"
              aria-haspopup="listbox"
              aria-expanded={voiceDropdownOpen}
            >
              <span>{voiceGender === "female" ? "♀" : "♂"}</span>
              <span className="hidden sm:inline">Voice</span>
              <ChevronDown size={9} />
            </button>
            {/* Portal: outside AnimatePresence so createPortal target is always document.body */}
            {portalContainer && createPortal(
              <AnimatePresence>
                {voiceDropdownOpen && (
                  <motion.div
                    ref={voiceMenuRef}
                    key="voice-dropdown"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    role="listbox"
                    aria-label="Narrator voice"
                    style={{
                      position: "fixed",
                      top: dropdownPos.top,
                      right: dropdownPos.right,
                      minWidth: "120px",
                      background: "#1a1f29",
                      border: "1px solid rgba(200,155,60,0.25)",
                      borderRadius: "6px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
                      zIndex: 9999,
                      overflow: "hidden",
                    }}
                  >
                    {(["female", "male"] as const).map((g) => (
                      <button
                        key={g}
                        role="option"
                        aria-selected={voiceGender === g}
                        onClick={() => handleVoiceSelect(g)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "9px 14px",
                          fontSize: "12px",
                          textAlign: "left",
                          background: voiceGender === g ? "rgba(200,155,60,0.1)" : "transparent",
                          color: voiceGender === g ? "#c89b3c" : "rgba(200,190,180,0.7)",
                          letterSpacing: "0.06em",
                          cursor: "pointer",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={e => { if (voiceGender !== g) (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,190,180,0.06)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = voiceGender === g ? "rgba(200,155,60,0.1)" : "transparent"; }}
                      >
                        <span style={{ fontSize: "13px" }}>{g === "female" ? "♀" : "♂"}</span>
                        <span style={{ textTransform: "capitalize" }}>{g}</span>
                        {voiceGender === g && <span style={{ marginLeft: "auto", fontSize: "10px" }}>✓</span>}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>,
              portalContainer
            )}
          </div>

          {/* Rate control */}
          <div className="hidden sm:flex items-center gap-0.5" style={{ color: "rgba(200,190,180,0.35)" }}>
            <button
              onClick={() => adjustRate(-0.1)}
              className="p-1 hover:text-white transition-colors rounded"
              aria-label="Speak slower"
            >
              <Minus size={11} />
            </button>
            <span
              className="font-code w-7 text-center"
              style={{ fontSize: "11px", color: "rgba(200,190,180,0.5)" }}
            >
              {speechRate.toFixed(1)}
            </span>
            <button
              onClick={() => adjustRate(0.1)}
              className="p-1 hover:text-white transition-colors rounded"
              aria-label="Speak faster"
            >
              <Plus size={11} />
            </button>
          </div>

          {/* Mute */}
          <button
            onClick={toggleMute}
            className="p-1 transition-colors rounded hover:text-white"
            style={{ color: isMuted ? "rgba(200,190,180,0.2)" : "rgba(200,190,180,0.5)" }}
            aria-label={isMuted ? "Unmute" : "Mute audio"}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* Session ID */}
          <div
            className="font-code hidden lg:flex items-center gap-1"
            style={{ color: "rgba(200,190,180,0.2)", fontSize: "10px" }}
          >
            <TerminalSquare size={10} />
            {gameState.sessionId.slice(0, 8)}
          </div>

          {/* Delete Account */}
          {onDeleteAccount && (
            <button
              onClick={onDeleteAccount}
              className="flex items-center gap-1.5 transition-colors p-1 rounded"
              style={{ color: "rgba(200,190,180,0.3)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(248,113,113,0.9)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,190,180,0.3)")}
              aria-label="Delete account"
              title="Delete account"
            >
              <Trash2 size={14} />
            </button>
          )}

          {/* Logout */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 transition-colors p-1 rounded group"
              style={{ color: "rgba(200,190,180,0.3)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(248,113,113,0.7)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(200,190,180,0.3)")}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={14} />
              <span className="font-code hidden sm:inline" style={{ fontSize: "10px", letterSpacing: "0.14em" }}>
                EXIT
              </span>
            </button>
          )}
        </div>
      </header>

      {/* ══════════════ LOCATION STRIP ══════════════ */}
      <div className="location-strip px-2 sm:px-6">
        <Map size={12} style={{ color: "rgba(200,155,60,0.55)", flexShrink: 0 }} />
        <span
          className="font-display text-xs uppercase tracking-widest"
          style={{ color: "rgba(200,155,60,0.75)", letterSpacing: "0.2em", fontSize: "11px" }}
        >
          {currentRoom.name}
        </span>

        {activeEnemies.length > 0 && (
          <>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
            <Skull size={11} style={{ color: "rgba(248,113,113,0.55)", flexShrink: 0 }} />
            <span className="font-code text-xs" style={{ color: "rgba(248,113,113,0.55)", fontSize: "11px" }}>
              {activeEnemies.map(e => `${e.name} ${e.hp}HP`).join(", ")}
            </span>
          </>
        )}

        {/* Exit buttons + quick actions */}
        <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
          {Object.keys(currentRoom.exits).map(dir => (
            <motion.button
              key={dir}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => submitCommand(`move ${dir}`)}
              disabled={isPending || isGameOver}
              className="action-btn font-code text-xs uppercase px-2.5 py-1 transition-all"
              style={{
                border: "1px solid rgba(200,155,60,0.25)",
                color: "rgba(200,155,60,0.65)",
                background: "rgba(200,155,60,0.05)",
                fontSize: "10px",
                letterSpacing: "0.15em",
                opacity: isPending || isGameOver ? 0.4 : 1,
                cursor: isPending || isGameOver ? "not-allowed" : "pointer",
              }}
              aria-label={`Move ${dir}`}
            >
              {dir}
            </motion.button>
          ))}

          {isCombat && (
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => submitCommand("attack")}
              disabled={isPending || isGameOver}
              className="action-btn font-code text-xs uppercase px-2.5 py-1 transition-all"
              style={{
                border: "1px solid rgba(139,30,30,0.5)",
                color: "rgba(248,113,113,0.75)",
                background: "rgba(139,30,30,0.1)",
                fontSize: "10px",
                letterSpacing: "0.15em",
                opacity: isPending || isGameOver ? 0.4 : 1,
                cursor: isPending || isGameOver ? "not-allowed" : "pointer",
              }}
              aria-label="Attack"
            >
              <Swords size={10} className="inline mr-1" />atk
            </motion.button>
          )}

          <button
            onClick={() => submitCommand("look")}
            disabled={isPending || isGameOver}
            className="p-1 transition-colors rounded hover:text-white"
            style={{ color: "rgba(200,190,180,0.3)" }}
            aria-label="Look around"
            title="Look around"
          >
            <Eye size={12} />
          </button>
          <button
            onClick={() => submitCommand("status")}
            disabled={isPending || isGameOver}
            className="p-1 transition-colors rounded hover:text-white"
            style={{ color: "rgba(200,190,180,0.3)" }}
            aria-label="Show status"
            title="Show status"
          >
            <Info size={12} />
          </button>

          {/* ── Shop button ── */}
          <motion.button
            whileHover={{ scale: isModalOpen ? 1 : 1.06 }}
            whileTap={{ scale: isModalOpen ? 1 : 0.94 }}
            onClick={() => { if (!isModalOpen) setShopOpen(v => !v); }}
            disabled={isModalOpen}
            className="flex items-center gap-1 font-code text-xs uppercase px-2.5 py-1 transition-all"
            style={{
              border: shopOpen
                ? "1px solid rgba(200,155,60,0.55)"
                : "1px solid rgba(200,155,60,0.22)",
              color: shopOpen ? "#c89b3c" : "rgba(200,155,60,0.5)",
              background: shopOpen ? "rgba(200,155,60,0.12)" : "rgba(200,155,60,0.04)",
              borderRadius: 4,
              fontSize: "10px",
              letterSpacing: "0.15em",
              opacity: isModalOpen ? 0.4 : 1,
              cursor: isModalOpen ? "not-allowed" : "pointer",
            }}
            aria-label={shopOpen ? "Close shop" : "Open shop"}
            title={isModalOpen ? "Shop unavailable" : "Shop"}
          >
            <ShoppingBag size={10} />
            <span className="hidden sm:inline">Shop</span>
          </motion.button>
        </div>
      </div>

      {/* ══════════════ MAIN CONTENT ══════════════ */}
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden px-2 sm:px-3 pt-2 sm:pt-3 pb-0 gap-2 sm:gap-3" style={{ minHeight: 0 }}>

        {/* Terminal / Narration feed */}
        <div className="terminal-panel flex flex-col" style={{ height: "clamp(200px, 45vh, 480px)", flexShrink: 0 }}>
          {/* Terminal chrome bar */}
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: "#8b1e1e", opacity: 0.8 }} />
            <div className="terminal-dot" style={{ background: "rgba(200,155,60,0.5)" }} />
            <div className="terminal-dot" style={{ background: "rgba(58,134,255,0.4)" }} />
            <span
              className="font-code ml-2"
              style={{ color: "rgba(200,155,60,0.4)", fontSize: "10px", letterSpacing: "0.18em" }}
            >
              DUNGEON LOG
            </span>
            {parsedCommand && (
              <span
                className="font-code ml-auto"
                style={{ color: "rgba(200,190,180,0.25)", fontSize: "10px", letterSpacing: "0.14em" }}
              >
                {parsedCommand.action}
                {parsedCommand.direction ? ` · ${parsedCommand.direction}` : ""}
                {parsedCommand.target ? ` · ${parsedCommand.target}` : ""}
              </span>
            )}
          </div>

          {/* Scrollable log area */}
          <div className="flex-1 overflow-hidden relative">
            <NarrationFeed logs={displayLogs} newFromIndex={newFromIndex} />

            {/* ── Shop overlay (covers terminal area) ── */}
            <AnimatePresence>
              {shopOpen && (
                <ShopPanel
                  gold={gameState.gold}
                  ownedWeapons={shopWeapons}
                  ownedArmors={shopArmors}
                  sellableItems={shopItems}
                  view={shopMode}
                  onViewChange={(v: ShopView) => setShopMode(v)}
                  onBuy={shopBuyApi}
                  onSell={shopSellApi}
                  onUpgrade={shopUpgradeApi}
                  onLogMessage={addShopLog}
                  onClose={() => { setShopOpen(false); setShopMode("main"); }}
                  isMuted={isMuted}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom HUD: 2-col on desktop, stacked on mobile */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 flex-1 min-h-0 pb-2 sm:pb-3">
          <PlayerHUD
            name={player.name}
            level={player.level}
            dungeonLevel={player.dungeonLevel ?? 1}
            hp={player.hp}
            maxHp={player.maxHp}
            mp={player.mp}
            maxMp={player.maxMp}
            xp={player.xp}
            xpToNextLevel={player.xpToNextLevel}
            attack={player.attack}
            defense={player.defense}
            isCombat={isCombat}
          />

          <VoiceControl
            isSupported={voiceSupported}
            audioState={audioState}
            isListening={isListening}
            interimTranscript={interimTranscript}
            intentHint={intentHint}
            isPending={isPending}
            isGameOver={isGameOver}
            isModalOpen={isModalOpen}
            isCombat={isCombat}
            command={command}
            onCommandChange={setCommand}
            onSubmit={submitCommand}
            onToggleListen={toggleListening}
          />
        </div>
      </div>

      {/* ── Unified modal system — all overlays via GameModal (portal, z-9999) ── */}
      {(() => {
        type ModalView = "levelDecision" | "replayPrompt" | "death" | null;
        const modalView: ModalView =
          isGameOver             ? "death" :
          gameMode !== "explore" ? (gameMode as ModalView) :
          null;

        // ── Level Decision / Replay Prompt ────────────────────────────────
        if (modalView === "levelDecision" || modalView === "replayPrompt") {
          return (
            <GameModal
              isOpen
              title="VICTORIOUS"
              accentColor="#c89b3c"
              disableClose
              actions={
                <>
                  <ModalButton
                    variant="secondary"
                    ariaLabel={
                      modalView === "levelDecision"
                        ? "No, see other options"
                        : "No, exit the dungeon"
                    }
                    disabled={progressionPending}
                    onClick={() => {
                      if (progressionPending) return;
                      if (modalView === "levelDecision") {
                        submitCommand("replay_prompt");
                      } else {
                        stopListeningRef.current();
                        AudioManager.speak(
                          "You have left the dungeon. Your progress is safe.",
                          { interrupt: true }
                        );
                        AudioManager.onQueueDrained(() => { onLogoutRef.current?.(); });
                      }
                    }}
                  >
                    {modalView === "levelDecision" ? "No — Other Options" : "No — Exit"}
                  </ModalButton>
                  <ModalButton
                    variant="primary"
                    ariaLabel={modalView === "levelDecision" ? "Yes, advance to next level" : "Yes, replay this level"}
                    disabled={progressionPending}
                    onClick={() => {
                      if (progressionPending) return;
                      if (modalView === "levelDecision") nextLevelApi();
                      else replayLevelApi();
                    }}
                  >
                    {progressionPending
                      ? "Loading…"
                      : modalView === "levelDecision"
                      ? "Yes — Next Level"
                      : "Yes — Replay"}
                  </ModalButton>
                </>
              }
            >
              <div className="rune-divider w-52 mx-auto">✦</div>
              <p className="font-narration italic text-xl" style={{ color: "rgba(200,155,60,0.75)" }}>
                {modalView === "levelDecision"
                  ? "The boss has fallen. The path forward is open."
                  : "Do you wish to face this dungeon once more?"}
              </p>
              <p className="text-base font-bold" style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}>
                {modalView === "levelDecision" ? "Proceed to the next level?" : "Replay this level?"}
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>
                <>Say <strong style={{ color: "rgba(255,255,255,0.55)" }}>"yes"</strong> or <strong style={{ color: "rgba(255,255,255,0.55)" }}>"no"</strong></>
              </p>
              <div className="rune-divider w-52 mx-auto">✦</div>
            </GameModal>
          );
        }

        // ── Game Over ─────────────────────────────────────────────────────
        if (modalView === "death") {
          return (
            <GameModal
              isOpen
              title="FALLEN"
              accentColor="#8b1e1e"
              disableClose
              actions={
                <>
                  <ModalButton
                    variant="secondary"
                    accentColor="#8b1e1e"
                    ariaLabel="No, exit the dungeon"
                    disabled={restartPending}
                    onClick={() => {
                      stopListeningRef.current();
                      AudioManager.speak("You have exited the dungeon. Return when you are ready.", { interrupt: true });
                      AudioManager.onQueueDrained(() => { onLogoutRef.current?.(); });
                    }}
                  >
                    No — Exit
                  </ModalButton>
                  <ModalButton
                    variant="primary"
                    accentColor="#8b1e1e"
                    ariaLabel="Yes, restart the dungeon"
                    disabled={restartPending}
                    onClick={restartApi}
                  >
                    {restartPending ? "Restarting…" : "Yes — Restart"}
                  </ModalButton>
                </>
              }
            >
              <div className="rune-divider w-52 mx-auto">✦</div>
              <p className="font-narration italic text-xl" style={{ color: "rgba(200,155,60,0.75)" }}>
                The dungeon claims another soul — but the story is not yet over.
              </p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>
                Weapons, armor &amp; gold are preserved.
              </p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>
                Say <strong style={{ color: "rgba(255,255,255,0.55)" }}>"yes"</strong> or{" "}
                <strong style={{ color: "rgba(255,255,255,0.55)" }}>"no"</strong>
              </p>
              <div className="rune-divider w-52 mx-auto">✦</div>
            </GameModal>
          );
        }

        return null;
      })()}
    </div>
  );
}
