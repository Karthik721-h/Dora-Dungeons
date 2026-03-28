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

function Bar({
  value,
  max,
  color,
  label,
  textColor,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  textColor: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span
          className="font-code text-xs uppercase tracking-widest"
          style={{ color: "rgba(200,190,180,0.45)", letterSpacing: "0.18em" }}
        >
          {label}
        </span>
        <span className="font-code text-xs" style={{ color: textColor, opacity: 0.8 }}>
          {value} / {max}
        </span>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <motion.div
          className="stat-bar-fill h-full rounded-full"
          style={{ background: color, width: `${pct}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function PlayerHUD({
  name, level, hp, maxHp, mp, maxMp, xp, xpToNextLevel, attack, defense, isCombat,
}: PlayerHUDProps) {
  const hpPct = maxHp > 0 ? hp / maxHp : 0;
  const hpColor =
    hpPct > 0.5
      ? "linear-gradient(to right, #991b1b, #dc2626)"
      : hpPct > 0.25
      ? "linear-gradient(to right, #b45309, #f59e0b)"
      : "linear-gradient(to right, #7f1d1d, #ef4444)";

  return (
    <div
      className="glass-panel p-4 space-y-4"
      style={{ borderColor: isCombat ? "rgba(179,18,47,0.3)" : undefined }}
    >
      {/* Name + Level */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="font-display text-base font-bold tracking-wider"
            style={{ color: "#e8e0d0" }}
          >
            {name}
          </h2>
          <p className="font-code text-xs" style={{ color: "rgba(212,175,55,0.6)" }}>
            adventurer
          </p>
        </div>
        <div
          className="font-display text-center px-3 py-1"
          style={{
            border: "1px solid rgba(212,175,55,0.3)",
            color: "rgba(212,175,55,0.9)",
            fontSize: "11px",
            letterSpacing: "0.15em",
          }}
        >
          LVL {level}
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        <Bar
          label="HP"
          value={hp}
          max={maxHp}
          color={hpColor}
          textColor="#f87171"
        />
        <Bar
          label="MP"
          value={mp}
          max={maxMp}
          color="linear-gradient(to right, #1e3a8a, #3b82f6)"
          textColor="#60a5fa"
        />
        <Bar
          label="XP"
          value={xp}
          max={xpToNextLevel}
          color="linear-gradient(to right, #78350f, #d97706)"
          textColor="#fbbf24"
        />
      </div>

      {/* Combat stats */}
      <div
        className="flex gap-4 pt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="text-center flex-1">
          <div className="font-display text-sm font-bold" style={{ color: "#f87171" }}>
            {attack}
          </div>
          <div
            className="font-code text-xs uppercase tracking-wider"
            style={{ color: "rgba(200,190,180,0.35)", fontSize: "10px" }}
          >
            ATK
          </div>
        </div>
        <div
          className="w-px"
          style={{ background: "rgba(255,255,255,0.06)" }}
        />
        <div className="text-center flex-1">
          <div className="font-display text-sm font-bold" style={{ color: "#60a5fa" }}>
            {defense}
          </div>
          <div
            className="font-code text-xs uppercase tracking-wider"
            style={{ color: "rgba(200,190,180,0.35)", fontSize: "10px" }}
          >
            DEF
          </div>
        </div>
      </div>
    </div>
  );
}
