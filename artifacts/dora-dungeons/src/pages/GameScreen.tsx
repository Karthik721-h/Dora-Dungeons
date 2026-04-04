import { useState, useRef, useEffect, useCallback } from "react";
import { useProcessAction, GameStateResponse } from "@workspace/api-client-react";
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
import { ShopPanel, ShopView } from "@/components/ShopPanel";
import { ShopWeapon, ShopArmor, ShopInventoryItem, SHOP_WEAPONS, buyWeapon, sellItem, upgradeArmor } from "@/shop";
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

  // ── Shop state (fully client-side; server doesn't track gold/weapons/armors yet) ──
  const [shopOpen, setShopOpen] = useState(false);
  const [shopMode, setShopMode] = useState<"main" | "buy" | "sell" | "upgrade">("main");
  const [shopGold, setShopGold] = useState(0);
  const [shopWeapons, setShopWeapons] = useState<ShopWeapon[]>([]);
  const [shopArmors, setShopArmors] = useState<ShopArmor[]>([]);
  const [shopItems, setShopItems] = useState<ShopInventoryItem[]>([]);
  const [shopExtraLogs, setShopExtraLogs] = useState<string[]>([]);

  // Refs so submitCommand (a useCallback) always sees fresh shop state
  const shopOpenRef    = useRef(shopOpen);
  const shopModeRef    = useRef(shopMode);
  const shopGoldRef    = useRef(shopGold);
  const shopWeaponsRef = useRef(shopWeapons);
  const shopArmorsRef  = useRef(shopArmors);
  const shopItemsRef   = useRef(shopItems);

  const prevLogsRef    = useRef<string[]>(gameState.logs);
  const isMutedRef     = useRef(isMuted);
  const gameStateRef   = useRef(gameState);
  const queryClient = useQueryClient();
  const stopListeningRef = useRef<() => void>(() => {});
  const onLogoutRef = useRef(onLogout);
  const voiceGenderRef = useRef(voiceGender);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    AudioManager.onStateChange(setAudioSpeaking);
  }, []);

  // ── Auto-start voice ───────────────────────────────────────────────────────
  const hasAutoStartedRef = useRef(false);
  useEffect(() => {
    if (hasAutoStartedRef.current || isMuted || !voiceSupported) return;
    if (!gameState.logs.length) return;
    hasAutoStartedRef.current = true;

    const t = setTimeout(() => {
      AudioManager.speak(
        "Welcome to Dora Dungeons. Voice control is active. Say help at any time to hear the list of commands. Speak when you are ready."
      );
      // Speak the last few log lines so the player hears the starting room
      const lines = gameState.logs.slice(-5);
      AudioManager.speakLines(lines);
      // Always append exits so blind users know immediately where they can go
      if (!exitsAlreadySpoken(lines)) {
        AudioManager.speak(buildExitsAnnouncement(gameState.currentRoom.exits), { interrupt: false });
      }
      AudioManager.onQueueDrained(() => {
        if (!hasAutoStartedRef.current) return;
        startListening();
      });
    }, 700);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        console.log("[GameScreen] New lines for TTS:", newLines);

        if (!isMutedRef.current && newLines.length > 0) {
          // When the engine returns an "Unknown command" response, replace the
          // verbose hint text with a single accessible prompt instead of reading
          // out the raw developer-facing command syntax.
          const isUnknownCommand = newLines.some(l => /^Unknown command:/i.test(l));
          const linesToSpeak = isUnknownCommand
            ? ["Say help to hear the available voice commands."]
            : newLines;

          AudioManager.speakLines(linesToSpeak, { interrupt: true });
          // Always queue exits after narration so visually impaired users
          // always know where they can go, regardless of which command fired.
          if (!exitsAlreadySpoken(newLines) && newData.gameStatus !== "GAME_OVER") {
            AudioManager.speak(
              buildExitsAnnouncement(newData.currentRoom.exits),
              { interrupt: false }
            );
          }
        }
        if (!isMutedRef.current) {
          if (newData.gameStatus === "IN_COMBAT" && gameStateRef.current.gameStatus !== "IN_COMBAT") {
            AudioManager.playCombatAlert();
          }
          if (newLines.some(l => l.toLowerCase().includes("experience") || l.toLowerCase().includes("level"))) {
            AudioManager.playRewardChime();
          }
        }
      },
    },
  });

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

      /** Normalize a string for fuzzy name matching. */
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

      /** True if spoken overlaps weapon/item/armor name, or vice versa. */
      const fuzzyMatch = (spoken: string, name: string) => {
        const sp = norm(spoken);
        const nm = norm(name);
        return nm.includes(sp) || sp.includes(nm);
      };

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
            const result = buyWeapon(shopGoldRef.current, shopWeaponsRef.current, match.id);
            if (result.success) {
              setShopGold(result.data.gold);
              setShopWeapons(result.data.weapons);
              speakPurchaseSuccess(match.name, result.data.gold);
              addShopLog(`✓ ${match.name} purchased successfully.`);
            } else {
              speakPurchaseFail();
            }
            return;
          }
        }

        if (mode === "sell") {
          const match = shopItemsRef.current.find((i) => fuzzyMatch(trimmed, i.name));
          if (match) {
            const result = sellItem(shopGoldRef.current, shopItemsRef.current, match.id);
            if (result.success) {
              setShopGold(result.data.gold);
              setShopItems(result.data.inventory);
              speakSellSuccess(match.name, result.data.gold);
              addShopLog(`✓ ${match.name} sold successfully.`);
            } else {
              speakShopNoMatch();
            }
            return;
          }
        }

        if (mode === "upgrade") {
          const match = shopArmorsRef.current.find((a) => fuzzyMatch(trimmed, a.name));
          if (match) {
            const result = upgradeArmor(shopGoldRef.current, shopArmorsRef.current, match.id);
            if (result.success) {
              setShopGold(result.data.gold);
              setShopArmors(result.data.armors);
              const upgraded = result.data.armors.find((a) => a.id === match.id);
              speakUpgradeSuccess(match.name, upgraded?.level ?? 0, result.data.gold);
              addShopLog(`✓ ${match.name} upgraded to level ${upgraded?.level}.`);
            } else if (result.message === "ARMOR_MAX_LEVEL") {
              speakUpgradeMax();
            } else {
              speakUpgradeFail();
            }
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
      const { canonical, wasNormalized } = processIntent(raw);
      setCommand(canonical);
      if (wasNormalized) setIntentHint(`"${raw}" → "${canonical}"`);
      else setIntentHint(null);
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
  shopGoldRef.current    = shopGold;
  shopWeaponsRef.current = shopWeapons;
  shopArmorsRef.current  = shopArmors;
  shopItemsRef.current   = shopItems;

  // ── Click-outside: close voice dropdown ──────────────────────────────────────
  useEffect(() => {
    if (!voiceDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(e.target as Node)) {
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
  const isGameOver = gameStatus === "GAME_OVER";

  // Merge server logs with any shop action messages so they appear in the terminal
  const displayLogs = shopExtraLogs.length > 0 ? [...logs, ...shopExtraLogs] : logs;

  /** Append a shop action result to the terminal log feed. */
  const addShopLog = (msg: string) => {
    setShopExtraLogs(prev => {
      setNewFromIndex(logs.length + prev.length);
      return [...prev, `[SHOP] ${msg}`];
    });
  };

  const handleShopUpdate = (next: { gold: number; weapons: ShopWeapon[]; armors: ShopArmor[]; items?: ShopInventoryItem[] }) => {
    setShopGold(next.gold);
    setShopWeapons(next.weapons);
    setShopArmors(next.armors);
    if (next.items !== undefined) setShopItems(next.items);
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

        {/* Center: game status */}
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
          <div className="relative" ref={voiceDropdownRef}>
            <button
              onClick={() => setVoiceDropdownOpen(v => !v)}
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
            <AnimatePresence>
              {voiceDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  role="listbox"
                  aria-label="Narrator voice"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    minWidth: "120px",
                    background: "#1a1f29",
                    border: "1px solid rgba(200,155,60,0.25)",
                    borderRadius: "6px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
                    zIndex: 100,
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
            </AnimatePresence>
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
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setShopOpen(v => !v)}
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
              cursor: "pointer",
            }}
            aria-label={shopOpen ? "Close shop" : "Open shop"}
            title="Shop"
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
                  gold={shopGold}
                  ownedWeapons={shopWeapons}
                  ownedArmors={shopArmors}
                  sellableItems={shopItems}
                  view={shopMode}
                  onViewChange={(v: ShopView) => setShopMode(v)}
                  onUpdate={handleShopUpdate}
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

      {/* ── Game Over overlay ── */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ background: "rgba(5,3,8,0.92)", backdropFilter: "blur(6px)" }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-center space-y-5"
            >
              <div className="rune-divider w-52 mx-auto">✦</div>
              <h2
                className="font-display text-5xl font-black tracking-widest"
                style={{
                  color: "#8b1e1e",
                  textShadow: "0 0 40px rgba(139,30,30,0.7), 0 0 80px rgba(139,30,30,0.25)",
                }}
              >
                FALLEN
              </h2>
              <p className="font-narration italic text-xl" style={{ color: "rgba(200,155,60,0.7)" }}>
                The dungeon claims another soul.
              </p>
              <div className="rune-divider w-52 mx-auto">✦</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
