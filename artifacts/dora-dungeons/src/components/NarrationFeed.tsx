import { useRef, useEffect } from "react";
import { motion } from "framer-motion";

type MessageKind = "system" | "combat" | "victory" | "reward" | "heal" | "narration" | "room";

interface NarrationFeedProps {
  logs: string[];
  newFromIndex?: number;
}

function classifyLog(log: string): MessageKind {
  if (log.startsWith(">")) return "system";
  const l = log.toLowerCase();

  if (
    l.includes("damage") || l.includes("slashes") || l.includes("claws") ||
    l.includes("strikes you") || l.includes("bites") || l.includes("attacks") ||
    l.includes("rakes") || (l.startsWith("the ") && (l.includes(" hits") || l.includes(" strikes")))
  ) return "combat";

  if (
    l.includes("defeated") || l.includes("crumbles") || l.includes("shatters") ||
    l.includes("crumples") || l.includes("falls") || l.includes("slain") || l.includes("victory")
  ) return "victory";

  if (
    l.includes("experience") || l.includes("gold") || l.includes("level up") ||
    l.includes("pocket") || l.includes("you gain") || l.includes("you found") || l.includes("picked up")
  ) return "reward";

  if (
    l.includes("heal") || l.includes("restored") || l.includes("restore") ||
    l.includes("warm") || l.includes("glow") || l.includes("mana") || l.includes("shrine")
  ) return "heal";

  if (
    l.startsWith("you enter") || l.startsWith("you move") || l.startsWith("you head") ||
    l.startsWith("you step") || l.startsWith("—") || l.startsWith("exits:")
  ) return "room";

  return "narration";
}

// Base inline styles per kind (colour + font only — no glow here, that goes in className)
const KIND_STYLE: Record<MessageKind, React.CSSProperties> = {
  system:    {
    color: "rgba(200,190,180,0.25)",
    fontStyle: "italic",
    fontFamily: "'Fira Code', monospace",
    fontSize: "0.75rem",
    letterSpacing: "0.04em",
  },
  combat:    { color: "#f87171", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem", lineHeight: 1.7 },
  victory:   { fontFamily: "'Crimson Text', serif", fontSize: "1.08rem", lineHeight: 1.7, fontWeight: 600 },
  reward:    { color: "#d97706", fontFamily: "'Crimson Text', serif", fontSize: "1rem", lineHeight: 1.7 },
  heal:      { color: "#34d399", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem", lineHeight: 1.7 },
  room:      { color: "rgba(220,210,195,0.58)", fontFamily: "'Crimson Text', serif", fontSize: "1rem", fontStyle: "italic", lineHeight: 1.7 },
  narration: { color: "#e8e0d0", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem", lineHeight: 1.7 },
};

// Extra glow className per kind
const KIND_GLOW_CLASS: Record<MessageKind, string> = {
  system:    "",
  combat:    "msg-combat",
  victory:   "msg-victory-shimmer",   // gold shimmer sweep
  reward:    "msg-reward",
  heal:      "msg-heal",
  narration: "",
  room:      "",
};

const KIND_PREFIX: Record<MessageKind, string> = {
  system:    "",
  combat:    "⚔ ",
  victory:   "✦ ",
  reward:    "◆ ",
  heal:      "✦ ",
  room:      "",
  narration: "",
};

function LogMessage({ log, isNew, index }: { log: string; isNew: boolean; index: number }) {
  const kind = classifyLog(log);
  const prefix = KIND_PREFIX[kind];
  const glowClass = KIND_GLOW_CLASS[kind];

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 6 } : { opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: isNew ? Math.min(index * 0.07, 0.28) : 0, ease: "easeOut" }}
      className={`leading-relaxed ${glowClass}`}
      style={{
        ...KIND_STYLE[kind],
        paddingTop: kind === "system" ? "0.875rem" : undefined,
        paddingBottom: kind === "system" ? "0.125rem" : undefined,
      }}
      role="listitem"
    >
      {prefix && (
        <span aria-hidden="true" style={{ opacity: 0.75, marginRight: "0.3rem" }}>{prefix}</span>
      )}
      {log}
    </motion.div>
  );
}

export function NarrationFeed({ logs, newFromIndex = 0 }: NarrationFeedProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      className="h-full overflow-y-auto px-5 py-5 space-y-3"
      role="log"
      aria-live="polite"
      aria-label="Game narration"
      style={{ scrollbarGutter: "stable", position: "relative", zIndex: 1 }}
    >
      {logs.map((log, i) => (
        <LogMessage
          key={i}
          log={log}
          isNew={i >= newFromIndex}
          index={i - newFromIndex}
        />
      ))}

      {/* Blinking cursor — always at the end of the log */}
      <div
        className="flex items-center mt-1"
        aria-hidden="true"
      >
        <span
          className="font-code"
          style={{ color: "rgba(200,155,60,0.4)", fontSize: "0.78rem", letterSpacing: "0.05em" }}
        >
          &gt;
        </span>
        <span className="terminal-cursor ml-1" />
      </div>

      <div ref={endRef} className="h-1" />
    </div>
  );
}
