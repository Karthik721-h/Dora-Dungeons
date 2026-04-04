import { motion } from "framer-motion";

interface PlayerHUDProps {
  name: string;
  level: number;
  dungeonLevel: number;
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
  const isLow = pct < 25;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span
          className="font-code text-xs uppercase tracking-widest"
          style={{ color: "rgba(200,190,180,0.4)", letterSpacing: "0.18em", fontSize: "9px" }}
        >
          {label}
        </span>
        <span
          className="font-code text-xs"
          style={{
            color: textColor,
            opacity: 0.85,
            fontSize: "11px",
            animation: isLow ? "combat-breathe 1.5s ease-in-out infinite" : undefined,
          }}
        >
          {value} / {max}
        </span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.05)", borderRadius: "999px" }}
      >
        <motion.div
          className="stat-bar-fill h-full"
          style={{
            background: color,
            width: `${pct}%`,
            borderRadius: "999px",
            boxShadow: isLow ? `0 0 8px ${textColor}44` : undefined,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function PlayerHUD({
  name, level, dungeonLevel, hp, maxHp, mp, maxMp, xp, xpToNextLevel, attack, defense, isCombat,
}: PlayerHUDProps) {
  const hpPct = maxHp > 0 ? hp / maxHp : 0;
  const hpColor =
    hpPct > 0.5
      ? "linear-gradient(90deg, #991b1b 0%, #dc2626 100%)"
      : hpPct > 0.25
      ? "linear-gradient(90deg, #b45309 0%, #f59e0b 100%)"
      : "linear-gradient(90deg, #7f1d1d 0%, #ef4444 100%)";

  return (
    <div
      className="glass-panel p-4 flex flex-col gap-4 overflow-y-auto"
      style={{
        borderColor: isCombat ? "rgba(139,30,30,0.4)" : undefined,
        boxShadow: isCombat
          ? "0 4px 24px rgba(139,30,30,0.15), inset 0 1px 0 rgba(255,255,255,0.03)"
          : undefined,
        minHeight: 0,
      }}
    >
      {/* Name + level */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2
            className="font-display font-bold tracking-wider truncate"
            style={{ color: "#e8e0d0", fontSize: "clamp(0.85rem, 2vw, 1rem)" }}
          >
            {name}
          </h2>
          <p className="font-code text-xs" style={{ color: "rgba(200,155,60,0.55)", fontSize: "10px" }}>
            adventurer
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div
            className="font-display text-center"
            style={{
              border: "1px solid rgba(200,155,60,0.35)",
              color: "rgba(200,155,60,0.9)",
              fontSize: "10px",
              letterSpacing: "0.15em",
              padding: "3px 10px",
              borderRadius: "999px",
              background: "rgba(200,155,60,0.07)",
              whiteSpace: "nowrap",
            }}
          >
            LVL {level}
          </div>
          <div
            className="font-display text-center"
            style={{
              border: "1px solid rgba(58,134,255,0.35)",
              color: "rgba(58,134,255,0.85)",
              fontSize: "9px",
              letterSpacing: "0.12em",
              padding: "2px 8px",
              borderRadius: "999px",
              background: "rgba(58,134,255,0.07)",
              whiteSpace: "nowrap",
            }}
          >
            DUNGEON {dungeonLevel}
          </div>
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        <Bar label="HP" value={hp} max={maxHp} color={hpColor} textColor="#f87171" />
        <Bar
          label="MP"
          value={mp}
          max={maxMp}
          color="linear-gradient(90deg, #1e3a8a 0%, #3b82f6 100%)"
          textColor="#60a5fa"
        />
        <Bar
          label="XP"
          value={xp}
          max={xpToNextLevel}
          color="linear-gradient(90deg, #78350f 0%, #d97706 100%)"
          textColor="#c89b3c"
        />
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-2 gap-3 pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Attack */}
        <div
          className="flex items-center gap-2 rounded-lg p-2"
          style={{ background: "rgba(139,30,30,0.08)", border: "1px solid rgba(139,30,30,0.18)" }}
        >
          <div>
            <div className="font-display font-bold" style={{ color: "#f87171", fontSize: "1.1rem", lineHeight: 1 }}>
              {attack}
            </div>
            <div
              className="font-code uppercase tracking-wider mt-0.5"
              style={{ color: "rgba(200,190,180,0.35)", fontSize: "9px" }}
            >
              ATK
            </div>
          </div>
        </div>

        {/* Defense */}
        <div
          className="flex items-center gap-2 rounded-lg p-2"
          style={{ background: "rgba(58,134,255,0.07)", border: "1px solid rgba(58,134,255,0.18)" }}
        >
          <div>
            <div className="font-display font-bold" style={{ color: "#60a5fa", fontSize: "1.1rem", lineHeight: 1 }}>
              {defense}
            </div>
            <div
              className="font-code uppercase tracking-wider mt-0.5"
              style={{ color: "rgba(200,190,180,0.35)", fontSize: "9px" }}
            >
              DEF
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
