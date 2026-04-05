import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useProcessAction, GameStateResponse, customFetch, type ArmorState } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { getGetGameStateQueryKey } from "@workspace/api-client-react";
import {
  Map, Skull, TerminalSquare, Volume2, VolumeX, Plus, Minus,
  Eye, Info, LogOut, Swords, ChevronDown, ShoppingBag,
} from "lucide-react";

import { AudioManager } from "@/audio/AudioManager";
import { processIntent, directionToPan } from "@/audio/IntentProcessor";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { NarrationFeed } from "@/components/NarrationFeed";
import { PlayerHUD } from "@/components/PlayerHUD";
import { VoiceControl } from "@/components/VoiceControl";
import { ShopPanel, ShopView, ShopBuyResult, ShopSellResult, ShopUpgradeResult } from "@/components/ShopPanel";
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

function getNewLogs(prev: string[], next: string[]): string[] {
  if (next.length <= prev.length) return [];
  return next.slice(prev.length);
}

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
}: {
  gameState: GameStateResponse;
  onLogout?: () => void;
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
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartPending, setRestartPending]     = useState(false);
  // Guards against re-speaking the death TTS on subsequent renders.
  const deathTtsSpokenRef = useRef(false);

  // ── Level progression decision state ─────────────────────────────────────────
  // "explore"         → normal gameplay
  // "levelDecision"   → boss defeated, asking "next level or replay?"
  // "replayPrompt"    → player chose no, asking "replay or exit?"
  // "paymentDecision" → Level 1 boss beaten, payment required before Level 2
  const [gameMode, setGameMode] = useState<"explore" | "levelDecision" | "replayPrompt" | "paymentDecision">("explore");
  const [progressionPending, setProgressionPending] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  // ── Payment-return detection ──────────────────────────────────────────────────
  // Read ?payment=success / ?payment=cancelled from the URL synchronously during
  // component init so the VICTORY recovery effect can read them on its single run.
  const [paymentJustReturned] = useState(
    () => new URLSearchParams(window.location.search).get("payment") === "success"
  );
  const [paymentJustCancelled] = useState(
    () => new URLSearchParams(window.location.search).get("payment") === "cancelled"
  );
  // Prevents the payment-confirmed TTS from firing more than once even if the
  // component somehow re-mounts (e.g. strict mode double-invoke in dev).
  const hasAnnouncedPaymentRef  = useRef(false);
  const hasAnnouncedWaitingRef  = useRef(false);
  // When ?payment=success returns but the webhook hasn't fired yet, we poll
  // /api/payment/status until hasPaid is confirmed, then auto-transition.
  const [webhookWaiting, setWebhookWaiting] = useState(false);

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
  const gameModeRef         = useRef<"explore" | "levelDecision" | "replayPrompt" | "paymentDecision">("explore");
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
  const hasAutoStartedRef = useRef(false);
  useEffect(() => {
    if (hasAutoStartedRef.current || isMuted || !voiceSupported) return;
    if (!gameState.logs.length) return;
    // VICTORY and GAME_OVER have their own dedicated TTS effects
    if (
      gameState.gameStatus === "VICTORY" ||
      gameState.gameStatus === "GAME_OVER"
    ) return;
    hasAutoStartedRef.current = true;

    const isRestore = (gameState.turnCount ?? 0) > 0;

    const t = setTimeout(() => {
      if (!isRestore) {
        // ── New game ────────────────────────────────────────────────────────
        AudioManager.speak(
          "Welcome to Dora Dungeons. Voice control is active. Say help at any time to hear the list of commands. Speak when you are ready."
        );
        const lines = gameState.logs.slice(-5);
        AudioManager.speakLines(lines, { interrupt: false });
        if (!exitsAlreadySpoken(lines)) {
          AudioManager.speak(buildExitsAnnouncement(gameState.currentRoom.exits), { interrupt: false });
        }
      } else if (gameState.gameStatus === "IN_COMBAT") {
        // ── Restore: mid-combat ────────────────────────────────────────────
        const living = gameState.currentRoom.enemies.filter(e => !e.isDefeated);
        const enemySummary = living.length > 0
          ? living.map(e => `${e.name} with ${e.hp} of ${e.maxHp} health`).join(", and ")
          : "unknown enemies";
        AudioManager.speak(
          `Resuming your adventure. You are in combat with ${enemySummary}. What will you do?`,
          { interrupt: true }
        );
      } else {
        // ── Restore: exploring ─────────────────────────────────────────────
        AudioManager.speak("Resuming your adventure.", { interrupt: true });
        const lines = gameState.logs.slice(-3);
        AudioManager.speakLines(lines, { interrupt: false });
        if (!exitsAlreadySpoken(lines)) {
          AudioManager.speak(buildExitsAnnouncement(gameState.currentRoom.exits), { interrupt: false });
        }
      }
      AudioManager.onQueueDrained(() => {
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
    setShowRestartModal(true);

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
        if (!transitioningToDeath && !isMutedRef.current && newLines.length > 0) {
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
          // If the player just finished Level 1 and hasn't paid, route them
          // to the payment flow. Otherwise show the normal next/replay prompt.
          if (newData.event === "LEVEL_COMPLETED") {
            const needsPayment = newData.player.dungeonLevel === 1 && !newData.player.hasPaid;
            if (needsPayment) {
              gameModeRef.current = "paymentDecision";
              setGameMode("paymentDecision");
              if (!isMutedRef.current) {
                AudioManager.speak(
                  "The path forward is sealed by ancient magic. Only those who pledge their commitment may enter the next dungeon. A one-time offering of 30 dollars unlocks all future adventures. Say yes to proceed, or no to replay the dungeon.",
                  { interrupt: true }
                );
                AudioManager.onQueueDrained(() => {
                  stopListeningRef.current?.();
                  setTimeout(() => startListeningRef.current(), 120);
                });
              }
            } else {
              gameModeRef.current = "levelDecision";
              setGameMode("levelDecision");
              if (!isMutedRef.current) {
                AudioManager.speak(
                  `Congratulations! Dungeon level ${newData.player.dungeonLevel} complete. You defeated the boss. Would you like to advance to the next level? Say yes to continue, or say no for other options.`,
                  { interrupt: true }
                );
                AudioManager.onQueueDrained(() => {
                  stopListeningRef.current?.();
                  setTimeout(() => startListeningRef.current(), 120);
                });
              }
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

      if (trimmed === "initiate_payment") {
        initiatePayment();
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
        speakShopOpen();
        return;
      }

      if (trimmed === "exit_shop") {
        setShopOpen(false);
        setShopMode("main");
        speakShopExit();
        return;
      }

      if (trimmed === "shop_buy") {
        if (!shopOpenRef.current) { setShopOpen(true); }
        setShopMode("buy");
        speakWeaponList(SHOP_WEAPONS);
        return;
      }

      if (trimmed === "shop_sell") {
        if (!shopOpenRef.current) { setShopOpen(true); }
        setShopMode("sell");
        if (shopItemsRef.current.length === 0) {
          speakSellEmpty();
        } else {
          speakSellList(shopItemsRef.current);
        }
        return;
      }

      if (trimmed === "shop_upgrade") {
        if (!shopOpenRef.current) { setShopOpen(true); }
        setShopMode("upgrade");
        if (shopArmorsRef.current.length === 0) {
          speakNoArmor();
        } else {
          speakArmorList(shopArmorsRef.current);
        }
        return;
      }

      // ── Context-aware name selection while shop is open ──────────────────────
      if (shopOpenRef.current && shopModeRef.current !== "main") {
        const mode = shopModeRef.current;

        if (mode === "buy") {
          const match = SHOP_WEAPONS.find((w) => fuzzyMatch(trimmed, w.name));
          if (match) {
            shopBuyApi(match.id).catch(() => speakPurchaseFail());
            return;
          }
        }

        if (mode === "sell") {
          const match = shopItemsRef.current.find((i) => fuzzyMatch(trimmed, i.name));
          if (match) {
            shopSellApi(match.id).catch(() => speakShopNoMatch());
            return;
          }
        }

        if (mode === "upgrade") {
          const match = shopArmorsRef.current.find((a) => fuzzyMatch(trimmed, a.name));
          if (match) {
            shopUpgradeApi(match.id).catch((e) => {
              if (e?.message === "ARMOR_MAX_LEVEL") speakUpgradeMax();
              else speakUpgradeFail();
            });
            return;
          }
        }

        // In shop but no name matched
        speakShopNoMatch();
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

        if (gameModeRef.current === "paymentDecision") {
          if (isYes) {
            submitCommand("initiate_payment");
          } else if (isNo) {
            gameModeRef.current = "replayPrompt";
            setGameMode("replayPrompt");
            if (!isMutedRef.current) {
              AudioManager.speak(
                "You may continue exploring this dungeon, but greater challenges await beyond the sealed gate. Say yes whenever you are ready to proceed.",
                { interrupt: true }
              );
            }
          } else if (!isMutedRef.current) {
            AudioManager.speak(
              "Say yes to proceed with payment, or no to replay the dungeon.",
              { interrupt: false }
            );
          }
        } else if (gameModeRef.current === "levelDecision") {
          // "next level" as a two-word phrase is the natural post-payment command.
          const isNextLevel = /^next\s+level$/i.test(normalized);
          if (isYes || isNextLevel) {
            submitCommand("next_level");
          } else if (isNo) {
            // When paid, skip the extra "replay or exit?" prompt — go straight to replay.
            if (gameStateRef.current.player.hasPaid) {
              submitCommand("replay_level");
            } else {
              submitCommand("replay_prompt");
            }
          } else if (!isMutedRef.current) {
            const hint = gameStateRef.current.player.hasPaid
              ? "Say next level to continue, or no to replay this level."
              : "Say yes to advance to the next level, or no for other options.";
            AudioManager.speak(hint, { interrupt: false });
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

  // ── Restore decision mode if the page was refreshed during a VICTORY ────────
  // gameMode is React state and resets to "explore" on every mount. If the DB
  // still has gameStatus === "VICTORY" (boss was killed but no choice was made),
  // the player would be stuck with no way to advance. This effect runs exactly
  // once on mount, detects that condition, and re-enters levelDecision mode.
  useEffect(() => {
    // ── Clean ?payment=success / ?payment=cancelled from the URL ─────────────
    if (paymentJustReturned || paymentJustCancelled) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("payment");
      window.history.replaceState({}, "", clean.toString());
    }

    if (gameState.gameStatus !== "VICTORY") return;

    const needsPayment = gameState.player.dungeonLevel === 1 && !gameState.player.hasPaid;

    if (needsPayment) {
      // hasPaid is still false — either the webhook hasn't fired yet, or the
      // player cancelled. Keep them in the paymentDecision gate.
      gameModeRef.current = "paymentDecision";
      setGameMode("paymentDecision");
      if (!isMutedRef.current) {
        if (paymentJustReturned) {
          // Webhook hasn't fired yet — speak a holding message and start polling.
          if (!hasAnnouncedWaitingRef.current) {
            hasAnnouncedWaitingRef.current = true;
            AudioManager.speak(
              "Finalizing your access. This may take a few seconds. Please wait.",
              { interrupt: true }
            );
          }
          setWebhookWaiting(true);
        } else {
          let msg: string;
          if (paymentJustCancelled) {
            msg = "Payment was not completed. No charge was made. You must complete payment to access Level 2 and beyond. Say yes to try again, or no to replay the dungeon.";
          } else {
            msg = "The path forward is sealed by ancient magic. Only those who pledge their commitment may enter the next dungeon. A one-time offering of 30 dollars unlocks all future adventures. Say yes to proceed, or no to replay the dungeon.";
          }
          AudioManager.speak(msg, { interrupt: true });
          AudioManager.onQueueDrained(() => {
            stopListeningRef.current?.();
            setTimeout(() => startListeningRef.current(), 120);
          });
        }
      }
    } else {
      // hasPaid is true — enter the normal level-decision flow.
      gameModeRef.current = "levelDecision";
      setGameMode("levelDecision");
      if (!isMutedRef.current) {
        // If the player just returned from Stripe checkout, use payment-specific TTS
        // so they hear confirmation rather than the generic "congratulations" message.
        // hasAnnouncedPaymentRef prevents double-firing in React strict-mode dev.
        if (paymentJustReturned && !hasAnnouncedPaymentRef.current) {
          hasAnnouncedPaymentRef.current = true;
          AudioManager.speak(
            "Payment confirmed. The ancient seal has been broken. A new dungeon awakens before you. Say next level to continue your adventure.",
            { interrupt: true }
          );
        } else if (!paymentJustReturned) {
          AudioManager.speak(
            "Congratulations. You have completed this level. Would you like to continue to the next level? Say yes to advance, or no for other options.",
            { interrupt: true }
          );
        }
        AudioManager.onQueueDrained(() => {
          stopListeningRef.current?.();
          setTimeout(() => startListeningRef.current(), 120);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional empty array — runs exactly once on mount

  // ── Webhook-delay poller ─────────────────────────────────────────────────────
  // When the player returned from Stripe but the webhook hasn't confirmed yet,
  // we poll /api/payment/status every 2 s (up to 6 tries = 12 s). On success we
  // transition to levelDecision and speak the reward TTS. On timeout we fall back
  // to the standard paymentDecision gate so the player isn't stuck.
  useEffect(() => {
    if (!webhookWaiting) return;
    const BASE = import.meta.env.BASE_URL as string;
    const token = localStorage.getItem("dd_jwt");
    let attempts = 0;
    const MAX = 6;

    const poll = async () => {
      try {
        const res = await fetch(`${BASE}api/payment/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json() as { hasPaid: boolean };
          if (data.hasPaid) {
            setWebhookWaiting(false);
            gameModeRef.current = "levelDecision";
            setGameMode("levelDecision");
            if (!isMutedRef.current && !hasAnnouncedPaymentRef.current) {
              hasAnnouncedPaymentRef.current = true;
              AudioManager.speak(
                "Payment confirmed. The ancient seal has been broken. A new dungeon awakens before you. Say next level to continue your adventure.",
                { interrupt: true }
              );
              AudioManager.onQueueDrained(() => {
                stopListeningRef.current?.();
                setTimeout(() => startListeningRef.current(), 120);
              });
            }
            return; // done — do not reschedule
          }
        }
      } catch {
        // network error — continue polling
      }
      attempts += 1;
      if (attempts >= MAX) {
        // Webhook took too long — drop into the normal payment gate.
        setWebhookWaiting(false);
        if (!isMutedRef.current) {
          AudioManager.speak(
            "Access could not be confirmed. If you completed payment, please refresh the page. Otherwise, say yes to try again.",
            { interrupt: true }
          );
          AudioManager.onQueueDrained(() => {
            stopListeningRef.current?.();
            setTimeout(() => startListeningRef.current(), 120);
          });
        }
      } else {
        id = window.setTimeout(poll, 2000);
      }
    };

    let id = window.setTimeout(poll, 2000);
    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookWaiting]);

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
      setShowRestartModal(false);
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

  // ── Payment initiation ────────────────────────────────────────────────────
  const initiatePayment = async () => {
    if (paymentPending) return;
    setPaymentPending(true);
    stopListeningRef.current?.();
    AudioManager.stop();
    try {
      const resp = await customFetch<{ url: string }>(
        `${import.meta.env.BASE_URL}api/payment/create-checkout-session`,
        { method: "POST" }
      );
      if (resp.url) {
        window.location.href = resp.url;
      }
    } catch {
      setPaymentPending(false);
      AudioManager.speak(
        "There was an error starting the payment. Please try again.",
        { interrupt: true }
      );
      AudioManager.onQueueDrained(() => {
        startListeningRef.current?.();
      });
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
      speakPurchaseSuccess(weaponName, resp.gold);
      addShopLog(`✓ ${weaponName} purchased.`);
    } else {
      speakPurchaseFail();
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
      speakSellSuccess(itemName, resp.gold);
      addShopLog(`✓ ${itemName} sold.`);
    } else {
      speakShopNoMatch();
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
      speakUpgradeSuccess(armor?.name ?? armorId, armor?.level ?? 0, resp.gold);
      addShopLog(`✓ ${armor?.name ?? armorId} upgraded to level ${armor?.level}.`);
    } else {
      if (resp.message === "ARMOR_MAX_LEVEL") speakUpgradeMax();
      else speakUpgradeFail();
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
        <div className="dd-navbar-center">
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
          <div className="flex items-center gap-0.5" style={{ color: "rgba(200,190,180,0.35)" }}>
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
      <div className="location-strip">
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
            whileHover={{ scale: gameMode !== "explore" ? 1 : 1.06 }}
            whileTap={{ scale: gameMode !== "explore" ? 1 : 0.94 }}
            onClick={() => { if (gameMode === "explore") setShopOpen(v => !v); }}
            disabled={gameMode !== "explore"}
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
              opacity: gameMode !== "explore" ? 0.4 : 1,
              cursor: gameMode !== "explore" ? "not-allowed" : "pointer",
            }}
            aria-label={shopOpen ? "Close shop" : "Open shop"}
            title={gameMode !== "explore" ? "Shop unavailable during level decision" : "Shop"}
          >
            <ShoppingBag size={10} />
            <span className="hidden sm:inline">Shop</span>
          </motion.button>
        </div>
      </div>

      {/* ══════════════ MAIN CONTENT ══════════════ */}
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden px-3 pt-3 pb-0 gap-3" style={{ minHeight: 0 }}>

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
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom HUD: 2-col on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 pb-3">
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
            isCombat={isCombat}
            command={command}
            onCommandChange={setCommand}
            onSubmit={submitCommand}
            onToggleListen={toggleListening}
          />
        </div>
      </div>

      {/* ── Payment Decision overlay ── */}
      {/* Shown when Level 1 is cleared but user hasn't paid yet */}
      <AnimatePresence>
        {gameMode === "paymentDecision" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ background: "rgba(5,3,8,0.95)", backdropFilter: "blur(6px)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Unlock full adventure — one-time payment required"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
              className="text-center space-y-6 px-6"
              style={{ maxWidth: 520 }}
            >
              <div className="rune-divider w-52 mx-auto">⚔</div>

              <h2
                className="font-display text-4xl font-black tracking-widest"
                style={{
                  color: "#c89b3c",
                  textShadow: "0 0 40px rgba(200,155,60,0.8), 0 0 80px rgba(200,155,60,0.3)",
                }}
              >
                LEVEL 1 COMPLETE
              </h2>

              <p className="font-narration italic text-xl" style={{ color: "rgba(200,155,60,0.75)" }}>
                The dungeon boss has fallen. Deeper darkness awaits.
              </p>

              <p
                className="text-base font-bold"
                style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em", lineHeight: 1.6 }}
              >
                Unlock all dungeon levels for a one-time payment of <span style={{ color: "#c89b3c" }}>$30</span>.
              </p>

              <p style={{ color: "rgba(200,190,180,0.55)", fontSize: "0.75rem", letterSpacing: "0.06em" }}>
                Say "yes" to pay, or "no" to replay Level 1.
              </p>

              <div className="flex gap-4 justify-center pt-2">
                <motion.button
                  whileHover={{ scale: paymentPending ? 1 : 1.06 }}
                  whileTap={{ scale: paymentPending ? 1 : 0.95 }}
                  onClick={() => {
                    if (paymentPending) return;
                    gameModeRef.current = "replayPrompt";
                    setGameMode("replayPrompt");
                    AudioManager.speak(
                      "Would you like to replay Level 1, or exit the dungeon? Say yes to replay, or no to exit.",
                      { interrupt: true }
                    );
                  }}
                  disabled={paymentPending}
                  aria-label="No, replay Level 1"
                  className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider"
                  style={{
                    background: "rgba(26,31,41,0.8)",
                    border: "1px solid rgba(200,155,60,0.4)",
                    color: paymentPending ? "rgba(200,155,60,0.3)" : "rgba(200,155,60,0.85)",
                    cursor: paymentPending ? "not-allowed" : "pointer",
                    minWidth: 130,
                  }}
                >
                  No — Replay
                </motion.button>

                <motion.button
                  whileHover={{ scale: paymentPending ? 1 : 1.06 }}
                  whileTap={{ scale: paymentPending ? 1 : 0.95 }}
                  onClick={() => { if (!paymentPending) initiatePayment(); }}
                  disabled={paymentPending}
                  aria-label="Yes, proceed to payment and unlock all levels"
                  className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider"
                  style={{
                    background: paymentPending ? "rgba(200,155,60,0.3)" : "rgba(200,155,60,0.88)",
                    border: "1px solid rgba(200,155,60,0.9)",
                    color: paymentPending ? "rgba(0,0,0,0.3)" : "#060810",
                    cursor: paymentPending ? "not-allowed" : "pointer",
                    minWidth: 130,
                  }}
                >
                  {paymentPending ? "Redirecting…" : "Yes — Unlock ($30)"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Level Progression overlay ── */}
      {/* Shown after boss defeat — routes the player to next level, replay, or exit */}
      <AnimatePresence>
        {(gameMode === "levelDecision" || gameMode === "replayPrompt") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ background: "rgba(5,3,8,0.93)", backdropFilter: "blur(6px)" }}
            role="dialog"
            aria-modal="true"
            aria-label={gameMode === "levelDecision" ? "Level complete — proceed?" : "Replay this level?"}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
              className="text-center space-y-6 px-6"
              style={{ maxWidth: 480 }}
            >
              <div className="rune-divider w-52 mx-auto">✦</div>

              <h2
                className="font-display text-5xl font-black tracking-widest"
                style={{
                  color: "#c89b3c",
                  textShadow: "0 0 40px rgba(200,155,60,0.8), 0 0 80px rgba(200,155,60,0.3)",
                }}
              >
                VICTORIOUS
              </h2>

              <p className="font-narration italic text-xl" style={{ color: "rgba(200,155,60,0.75)" }}>
                {gameMode === "levelDecision"
                  ? "The boss has fallen. The path forward is open."
                  : "Do you wish to face this dungeon once more?"}
              </p>

              <p
                className="text-base font-bold"
                style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}
              >
                {gameMode === "levelDecision"
                  ? "Proceed to the next level?"
                  : "Replay this level?"}
              </p>

              <div className="flex gap-4 justify-center pt-2">
                {/* No / secondary action */}
                <motion.button
                  whileHover={{ scale: progressionPending ? 1 : 1.06 }}
                  whileTap={{ scale: progressionPending ? 1 : 0.95 }}
                  onClick={() => {
                    if (progressionPending) return;
                    if (gameMode === "levelDecision") {
                      // When already paid, "no" goes straight to replay (no extra prompt needed)
                      if (player.hasPaid) {
                        replayLevelApi();
                      } else {
                        submitCommand("replay_prompt");
                      }
                    } else {
                      stopListeningRef.current();
                      AudioManager.speak(
                        "You have left the dungeon. Your progress is safe.",
                        { interrupt: true }
                      );
                      AudioManager.onQueueDrained(() => { onLogoutRef.current?.(); });
                    }
                  }}
                  disabled={progressionPending}
                  aria-label={
                    gameMode === "levelDecision"
                      ? (player.hasPaid ? "No, replay this level" : "No, see other options")
                      : "No, exit the dungeon"
                  }
                  className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider"
                  style={{
                    background: "rgba(26,31,41,0.8)",
                    border: "1px solid rgba(200,155,60,0.4)",
                    color: progressionPending ? "rgba(200,155,60,0.3)" : "rgba(200,155,60,0.85)",
                    boxShadow: "0 0 10px rgba(200,155,60,0.12)",
                    cursor: progressionPending ? "not-allowed" : "pointer",
                    minWidth: 130,
                  }}
                >
                  {gameMode === "levelDecision"
                    ? (player.hasPaid ? "No — Replay" : "No — Other Options")
                    : "No — Exit"}
                </motion.button>

                {/* Yes / primary action */}
                <motion.button
                  whileHover={{ scale: progressionPending ? 1 : 1.06 }}
                  whileTap={{ scale: progressionPending ? 1 : 0.95 }}
                  onClick={() => {
                    if (progressionPending) return;
                    if (gameMode === "levelDecision") nextLevelApi();
                    else replayLevelApi();
                  }}
                  disabled={progressionPending}
                  aria-label={gameMode === "levelDecision" ? "Yes, advance to next level" : "Yes, replay this level"}
                  className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider"
                  style={{
                    background: progressionPending
                      ? "rgba(200,155,60,0.3)"
                      : "rgba(200,155,60,0.88)",
                    border: "1px solid rgba(200,155,60,0.9)",
                    color: progressionPending ? "rgba(0,0,0,0.3)" : "#060810",
                    boxShadow: "0 0 18px rgba(200,155,60,0.4)",
                    cursor: progressionPending ? "not-allowed" : "pointer",
                    minWidth: 130,
                  }}
                >
                  {progressionPending
                    ? "Loading…"
                    : gameMode === "levelDecision"
                    ? "Yes — Next Level"
                    : "Yes — Replay"}
                </motion.button>
              </div>

              <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>
                {gameMode === "levelDecision" && gameState.player.hasPaid ? (
                  <>Say <strong style={{ color: "rgba(255,255,255,0.55)" }}>"next level"</strong> or <strong style={{ color: "rgba(255,255,255,0.55)" }}>"no"</strong></>
                ) : (
                  <>Say <strong style={{ color: "rgba(255,255,255,0.55)" }}>"yes"</strong> or <strong style={{ color: "rgba(255,255,255,0.55)" }}>"no"</strong></>
                )}
              </p>

              <div className="rune-divider w-52 mx-auto">✦</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Game Over overlay ── */}
      <AnimatePresence>
        {isGameOver && showRestartModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ background: "rgba(5,3,8,0.93)", backdropFilter: "blur(6px)" }}
            role="dialog"
            aria-modal="true"
            aria-label="You have fallen"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 180 }}
              className="text-center space-y-6 px-6"
              style={{ maxWidth: 480 }}
            >
              {/* Blood rune divider */}
              <div className="rune-divider w-52 mx-auto">✦</div>

              {/* Title */}
              <h2
                className="font-display text-6xl font-black tracking-widest"
                style={{
                  color: "#8b1e1e",
                  textShadow: "0 0 40px rgba(139,30,30,0.8), 0 0 80px rgba(139,30,30,0.3)",
                }}
              >
                FALLEN
              </h2>

              {/* Flavour */}
              <p className="font-narration italic text-xl" style={{ color: "rgba(200,155,60,0.75)" }}>
                The dungeon claims another soul — but the story is not yet over.
              </p>

              <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>
                Weapons, armor &amp; gold are preserved.
              </p>

              {/* Yes / No buttons */}
              <div className="flex gap-4 justify-center pt-2">
                <motion.button
                  whileHover={{ scale: restartPending ? 1 : 1.06 }}
                  whileTap={{ scale: restartPending ? 1 : 0.95 }}
                  onClick={restartApi}
                  disabled={restartPending}
                  aria-label="Yes, restart the dungeon"
                  className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider"
                  style={{
                    background: restartPending ? "rgba(139,30,30,0.4)" : "rgba(139,30,30,0.85)",
                    border: "1px solid rgba(139,30,30,0.9)",
                    color: restartPending ? "rgba(255,255,255,0.4)" : "#fff",
                    boxShadow: "0 0 18px rgba(139,30,30,0.4)",
                    cursor: restartPending ? "not-allowed" : "pointer",
                    minWidth: 130,
                  }}
                >
                  {restartPending ? "Restarting…" : "Yes — Restart"}
                </motion.button>

                <motion.button
                  whileHover={{ scale: restartPending ? 1 : 1.06 }}
                  whileTap={{ scale: restartPending ? 1 : 0.95 }}
                  onClick={() => {
                    stopListeningRef.current();
                    AudioManager.speak("You have exited the dungeon. Return when you are ready.", { interrupt: true });
                    AudioManager.onQueueDrained(() => { onLogoutRef.current?.(); });
                  }}
                  disabled={restartPending}
                  aria-label="No, exit the dungeon"
                  className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider"
                  style={{
                    background: "rgba(26,31,41,0.8)",
                    border: "1px solid rgba(200,155,60,0.4)",
                    color: restartPending ? "rgba(200,155,60,0.3)" : "rgba(200,155,60,0.85)",
                    boxShadow: "0 0 10px rgba(200,155,60,0.12)",
                    cursor: restartPending ? "not-allowed" : "pointer",
                    minWidth: 130,
                  }}
                >
                  No — Exit
                </motion.button>
              </div>

              {/* Voice hint */}
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>
                Say <strong style={{ color: "rgba(255,255,255,0.55)" }}>"yes"</strong> or <strong style={{ color: "rgba(255,255,255,0.55)" }}>"no"</strong>
              </p>

              <div className="rune-divider w-52 mx-auto">✦</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
