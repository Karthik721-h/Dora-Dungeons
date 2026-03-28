import { motion } from "framer-motion";

interface PlayerHUDProps {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  xp: number;
  xpToNextLevel: number;
  attack: number;
  defense: number;
  isCombat: boolean;
}

function MiniBar({
  value, max, color, label,
}: {
  value: number; max: number; color: string; label: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className="font-code shrink-0 w-5"
        style={{ color: "rgba(200,190,180,0.35)", fontSize: "9px", letterSpacing: "0.1em" }}
      >
        {label}
      </span>
      <div
        className="relative flex-1 overflow-hidden"
        style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}
      >
        <motion.div
          style={{ background: color, height: "100%", borderRadius: 2, width: `${pct}%` }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span
        className="font-code shrink-0 text-right"
        style={{ color: "rgba(200,190,180,0.4)", fontSize: "9px", minWidth: 28 }}
      >
        {value}
      </span>
    </div>
  );
}

export function PlayerHUD({
  name, level, hp, maxHp, mp, maxMp, xp, xpToNextLevel, attack, defense, isCombat,
}: PlayerHUDProps) {
  const hpPct = maxHp > 0 ? hp / maxHp : 0;
  const hpColor =
    hpPct > 0.5 ? "linear-gradient(to right,#7f1d1d,#dc2626)"
    : hpPct > 0.25 ? "linear-gradient(to right,#92400e,#f59e0b)"
    : "linear-gradient(to right,#7f1d1d,#ef4444)";

  return (
    <div
      className="flex flex-col justify-center gap-2 px-4 py-3 shrink-0"
      style={{
        width: 200,
        borderRight: "1px solid rgba(255,255,255,0.05)",
        borderTop: isCombat ? "1px solid rgba(179,18,47,0.2)" : "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Name row */}
      <div className="flex items-center justify-between mb-1">
        <span
          className="font-display font-bold truncate"
          style={{ color: "#e8e0d0", fontSize: 12, letterSpacing: "0.1em" }}
        >
          {name}
        </span>
        <span
          className="font-code shrink-0 ml-2"
          style={{
            color: "rgba(212,175,55,0.7)",
            fontSize: "9px",
            border: "1px solid rgba(212,175,55,0.25)",
            padding: "1px 5px",
            letterSpacing: "0.1em",
          }}
        >
          {level}
        </span>
      </div>

      {/* Bars */}
      <MiniBar label="HP" value={hp} max={maxHp} color={hpColor} />
      <MiniBar label="MP" value={mp} max={maxMp} color="linear-gradient(to right,#1e3a8a,#3b82f6)" />
      <MiniBar label="XP" value={xp} max={xpToNextLevel} color="linear-gradient(to right,#78350f,#d97706)" />

      {/* ATK / DEF */}
      <div className="flex gap-3 mt-1 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="font-code" style={{ color: "#f87171", fontSize: "9px" }}>
          ⚔ {attack}
        </span>
        <span className="font-code" style={{ color: "#60a5fa", fontSize: "9px" }}>
          🛡 {defense}
        </span>
      </div>
    </div>
  );
}
