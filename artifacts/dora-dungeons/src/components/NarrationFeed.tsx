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

const KIND_STYLE: Record<MessageKind, React.CSSProperties> = {
  system:    { color: "rgba(200,190,180,0.28)", fontStyle: "italic", fontFamily: "'Fira Code', monospace", fontSize: "0.78rem" },
  combat:    { color: "#f87171", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem" },
  victory:   { color: "#c89b3c", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem", fontWeight: 600 },
  reward:    { color: "#d97706", fontFamily: "'Crimson Text', serif", fontSize: "1rem" },
  heal:      { color: "#34d399", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem" },
  room:      { color: "rgba(220,210,195,0.62)", fontFamily: "'Crimson Text', serif", fontSize: "1rem", fontStyle: "italic" },
  narration: { color: "#e8e0d0", fontFamily: "'Crimson Text', serif", fontSize: "1.05rem" },
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

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 5 } : { opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: isNew ? Math.min(index * 0.07, 0.28) : 0 }}
      className="leading-relaxed"
      style={{
        ...KIND_STYLE[kind],
        paddingTop: kind === "system" ? "0.75rem" : undefined,
      }}
      role="listitem"
    >
      {prefix && (
        <span style={{ opacity: 0.7, marginRight: "0.25rem" }}>{prefix}</span>
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
      className="h-full overflow-y-auto px-5 py-4 space-y-2.5"
      role="log"
      aria-live="polite"
      aria-label="Game narration"
      style={{ scrollbarGutter: "stable" }}
    >
      {logs.map((log, i) => (
        <LogMessage
          key={i}
          log={log}
          isNew={i >= newFromIndex}
          index={i - newFromIndex}
        />
      ))}
      <div ref={endRef} className="h-1" />
    </div>
  );
}
