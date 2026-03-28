import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatBarProps {
  label: string;
  value: number;
  max: number;
  colorClass?: string;
  bgClass?: string;
}

export function StatBar({ label, value, max, colorClass = "bg-primary", bgClass = "bg-secondary" }: StatBarProps) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-end text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">
          {value} <span className="text-muted-foreground/50">/</span> {max}
        </span>
      </div>
      <div className={cn("h-1.5 w-full rounded-none overflow-hidden", bgClass)}>
        <motion.div 
          className={cn("h-full", colorClass)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
