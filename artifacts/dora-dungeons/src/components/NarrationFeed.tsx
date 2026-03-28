import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";

type MessageKind = "system" | "combat" | "victory" | "reward" | "heal" | "narration" | "room";

interface NarrationFeedProps {
  logs: string[];
  /** Index of the first log that is "new" this turn (for highlight animation). */
  newFromIndex?: number;
}

function classifyLog(log: string): MessageKind {
  if (log.startsWith(">")) return "system";
  const l = log.toLowerCase();

  if (
    l.includes("damage") ||
    l.includes("slashes") ||
    l.includes("claws") ||
    l.includes("strikes you") ||
    l.includes("bites") ||
    l.includes("attacks") ||
    l.includes("rakes") ||
    l.startsWith("the ") && (l.includes(" hits") || l.includes(" strikes"))
  ) return "combat";

  if (
    l.includes("defeated") ||
    l.includes("crumbles") ||
    l.includes("shatters") ||
    l.includes("crumples") ||
    l.includes("falls") ||
    l.includes("slain") ||
    l.includes("victory")
  ) return "victory";

  if (
    l.includes("experience") ||
    l.includes("gold") ||
    l.includes("level up") ||
    l.includes("pocket") ||
    l.includes("you gain") ||
    l.includes("you found") ||
    l.includes("picked up")
  ) return "reward";

  if (
    l.includes("heal") ||
    l.includes("restored") ||
    l.includes("restore") ||
    l.includes("warm") ||
    l.includes("glow") ||
    l.includes("mana") ||
    l.includes("shrine")
  ) return "heal";

  if (
    l.startsWith("you enter") ||
    l.startsWith("you move") ||
    l.startsWith("you head") ||
    l.startsWith("you step") ||
    l.startsWith("—") ||
    l.startsWith("exits:")
  ) return "room";

  return "narration";
}

const KIND_STYLES: Record<MessageKind, string> = {
  system:    "font-code text-sm opacity-50 italic mt-4 mb-2",
  combat:    "font-narration text-lg leading-relaxed",
  victory:   "font-narration text-lg leading-relaxed font-semibold",
  reward:    "font-narration text-base leading-relaxed",
  heal:      "font-narration text-lg leading-relaxed",
  room:      "font-narration text-base leading-relaxed opacity-80 italic",
  narration: "font-narration text-lg leading-relaxed",
};

const KIND_COLOR: Record<MessageKind, string> = {
  system:    "text-white/30",
  combat:    "text-red-400",
  victory:   "text-amber-300",
  reward:    "text-amber-400/90",
  heal:      "text-emerald-400/90",
  room:      "text-white/70",
  narration: "text-stone-200",
};

function LogMessage({ log, isNew, index }: { log: string; isNew: boolean; index: number }) {
  const kind = classifyLog(log);

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 6 } : { opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: isNew ? Math.min(index * 0.08, 0.3) : 0 }}
      className={`${KIND_STYLES[kind]} ${KIND_COLOR[kind]}`}
      role="listitem"
    >
      {log}
    </motion.div>
  );
}

export function NarrationFeed({ logs, newFromIndex = 0 }: NarrationFeedProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 md:px-10 py-6 space-y-3"
      role="log"
      aria-live="polite"
      aria-label="Game narration"
    >
      {logs.map((log, i) => (
        <LogMessage
          key={i}
          log={log}
          isNew={i >= newFromIndex}
          index={i - newFromIndex}
        />
      ))}
      <div ref={endRef} className="h-2" />
    </div>
  );
}
