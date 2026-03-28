import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface TerminalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost" | "destructive" | "action";
  size?: "default" | "sm" | "lg" | "icon";
  active?: boolean;
}

const TerminalButton = React.forwardRef<HTMLButtonElement, TerminalButtonProps>(
  ({ className, variant = "default", size = "default", active, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 uppercase tracking-widest",
          {
            "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50 hover:border-border hover:shadow-[0_0_8px_rgba(255,255,255,0.1)]": variant === "default",
            "bg-primary/10 text-primary border border-primary/50 hover:bg-primary/20 hover:border-primary terminal-text-primary hover:shadow-[0_0_12px_rgba(200,0,0,0.3)]": variant === "primary",
            "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
            "bg-destructive/10 text-destructive border border-destructive/50 hover:bg-destructive/20": variant === "destructive",
            "bg-card text-foreground border border-border hover:border-primary/50 hover:text-primary transition-all duration-300": variant === "action",
            "h-10 px-4 py-2": size === "default",
            "h-8 rounded-sm px-3 text-xs": size === "sm",
            "h-12 rounded-sm px-8 text-base": size === "lg",
            "h-10 w-10": size === "icon",
            "border-primary text-primary bg-primary/10 shadow-[0_0_8px_rgba(200,0,0,0.2)]": active,
          },
          className
        )}
        {...props}
      />
    );
  }
);
TerminalButton.displayName = "TerminalButton";

export { TerminalButton };
