/**
 * GameModal — unified portal-based modal for Dora Dungeons.
 *
 * Renders via React Portal (document.body) so it sits above ALL game UI
 * including the navbar, regardless of CSS stacking context.
 *
 * Features:
 *  • position: fixed z-[9999] — above everything
 *  • Framer-motion backdrop fade + content scale-in (≤ 200 ms)
 *  • Focus trap (Tab / Shift+Tab cycle within modal)
 *  • Escape key closes unless disableClose = true
 *  • role="dialog", aria-modal, aria-labelledby for screen readers
 *  • Mobile-responsive (max-w 90 vw, scrollable content)
 */
import { useId, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

// ── Focusable selector used for focus-trap ─────────────────────────────────
const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// ── Shared button component used by all modal callers ────────────────────────

interface ModalButtonProps {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  variant: "primary" | "secondary";
  accentColor?: string;
  children: ReactNode;
}

export function ModalButton({
  onClick,
  disabled = false,
  ariaLabel,
  variant,
  accentColor = "#c89b3c",
  children,
}: ModalButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="px-7 py-3 rounded-lg font-display text-lg font-bold tracking-wider focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minWidth: 130,
        cursor: disabled ? "not-allowed" : "pointer",
        ...(isPrimary
          ? {
              background: disabled ? `${accentColor}4d` : accentColor,
              border: `1px solid ${accentColor}e6`,
              color: disabled ? "rgba(0,0,0,0.3)" : "#060810",
              boxShadow: disabled ? "none" : `0 0 18px ${accentColor}66`,
              outlineColor: accentColor,
            }
          : {
              background: "rgba(26,31,41,0.8)",
              border: `1px solid ${accentColor}66`,
              color: disabled ? `${accentColor}4d` : `${accentColor}d9`,
              boxShadow: "0 0 10px rgba(200,155,60,0.12)",
              outlineColor: accentColor,
            }),
      }}
    >
      {children}
    </motion.button>
  );
}

// ── Main GameModal component ──────────────────────────────────────────────────

interface GameModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
  disableClose?: boolean;
  accentColor?: string;
}

export function GameModal({
  isOpen,
  title,
  children,
  actions,
  onClose,
  disableClose = true,
  accentColor = "#c89b3c",
}: GameModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // ── Focus trap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const el = dialogRef.current;

    // Focus first focusable element when modal opens
    const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusable[0]?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener("keydown", handleTab);
    return () => el.removeEventListener("keydown", handleTab);
  }, [isOpen]);

  // ── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || disableClose || !onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, disableClose, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        /* ── Backdrop ──────────────────────────────────────────────────── */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(5,3,8,0.95)",
            backdropFilter: "blur(6px)",
          }}
          onClick={(e) => {
            if (!disableClose && onClose && e.target === e.currentTarget) onClose();
          }}
        >
          {/* ── Dialog box ─────────────────────────────────────────────── */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            exit={{ scale: 0.92,    opacity: 0 }}
            transition={{ duration: 0.18, type: "spring", stiffness: 200, damping: 22 }}
            style={{
              width: "100%",
              maxWidth: "min(520px, 90vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              textAlign: "center",
              padding: "2rem 1.5rem",
            }}
          >
            {/* Title */}
            <h2
              id={titleId}
              className="font-display font-black tracking-widest"
              style={{
                color: accentColor,
                textShadow: `0 0 40px ${accentColor}cc, 0 0 80px ${accentColor}55`,
                fontSize: "clamp(2.25rem, 8vw, 3.5rem)",
                marginBottom: "1.25rem",
                lineHeight: 1.05,
              }}
            >
              {title}
            </h2>

            {/* Content */}
            <div className="space-y-4" style={{ marginBottom: "1.75rem" }}>
              {children}
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "1rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {actions}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
