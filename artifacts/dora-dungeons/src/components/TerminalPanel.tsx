import * as React from "react";
import { cn } from "@/lib/utils";

export interface TerminalPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  glow?: boolean;
}

export function TerminalPanel({ className, title, glow = false, children, ...props }: TerminalPanelProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col bg-card/80 backdrop-blur-sm border border-border rounded-sm overflow-hidden",
        glow && "shadow-[0_0_15px_rgba(0,0,0,0.5)] border-primary/20",
        className
      )}
      {...props}
    >
      {/* Decorative corner accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-muted-foreground/50" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-muted-foreground/50" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-muted-foreground/50" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-muted-foreground/50" />

      {title && (
        <div className="border-b border-border/50 bg-secondary/50 px-3 py-1.5 flex items-center justify-between">
          <h3 className="font-display text-xs font-bold text-muted-foreground tracking-widest">{title}</h3>
          <div className="flex gap-1">
            <div className="w-1 h-1 bg-primary/50 rounded-full animate-pulse-slow" />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden flex flex-col relative z-10">
        {children}
      </div>
    </div>
  );
}
