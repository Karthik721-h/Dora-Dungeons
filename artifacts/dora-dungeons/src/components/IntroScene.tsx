import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioManager } from "@/audio/AudioManager";

interface IntroSceneProps {
  onComplete: () => void;
}

const HEADPHONE_NOTICE = "For the best experience, please use headphones.";
const INTRO_NARRATION = "You descend into darkness. Ancient stones surround you. The air reeks of blood and old magic. Enter... if you dare.";

export function IntroScene({ onComplete }: IntroSceneProps) {
  const [phase, setPhase] = useState<"rising" | "held" | "exiting">("rising");
  const [showHeadphoneNotice, setShowHeadphoneNotice] = useState(true);
  const hasSpoken = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Speak headphone notice first, then queue intro narration
    const narrationTimer = setTimeout(() => {
      if (!hasSpoken.current) {
        hasSpoken.current = true;
        AudioManager.speak(HEADPHONE_NOTICE, { interrupt: true });
        AudioManager.speak(INTRO_NARRATION, { interrupt: false });
      }
    }, 600);

    // Fade out the headphone notice after ~3s
    const noticeTimer = setTimeout(() => setShowHeadphoneNotice(false), 3200);

    // Auto-advance after 6s to give room for both announcements
    const autoTimer = setTimeout(() => handleSkip(), 6000);

    return () => {
      clearTimeout(narrationTimer);
      clearTimeout(noticeTimer);
      clearTimeout(autoTimer);
    };
  }, []);

  const handleSkip = () => {
    if (phase === "exiting") return;
    AudioManager.stop();
    setPhase("exiting");
    // Shortened exit: 500ms (was 900ms)
    timerRef.current = setTimeout(onComplete, 500);
  };

  return (
    <AnimatePresence>
      {phase !== "exiting" ? (
        <motion.div
          key="intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "#07060a" }}
        >
          {/* Atmospheric background */}
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 60%, rgba(60,5,10,0.7) 0%, rgba(7,6,10,1) 65%)",
            }}
          />

          {/* Fog layers */}
          <div className="fog-layer" style={{ animationDelay: "0s" }} />
          <div
            className="fog-layer"
            style={{
              animationDelay: "-6s",
              background: "radial-gradient(ellipse at 30% 90%, rgba(30,5,15,0.6) 0%, transparent 65%)",
            }}
          />

          {/* Dungeon image — very faint */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}images/dungeon-bg.png)`,
              opacity: 0.06,
            }}
          />

          {/* Headphone notice — top of screen, fades out */}
          <AnimatePresence>
            {showHeadphoneNotice && (
              <motion.div
                key="headphone-notice"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5 }}
                className="absolute top-8 left-0 right-0 z-20 flex justify-center pointer-events-none"
                role="status"
                aria-live="polite"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1.25rem",
                    background: "rgba(12,15,22,0.88)",
                    border: "1px solid rgba(200,155,60,0.3)",
                    borderRadius: "999px",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 0 18px rgba(200,155,60,0.12), 0 4px 16px rgba(0,0,0,0.5)",
                  }}
                >
                  <span style={{ fontSize: "1.1rem" }}>🎧</span>
                  <span
                    style={{
                      fontFamily: "'Cinzel', serif",
                      fontSize: "0.7rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(200,155,60,0.85)",
                    }}
                  >
                    Use Headphones For Best Experience
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main content */}
          <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center max-w-lg">
            {/* Ornamental top */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.3, duration: 0.9, ease: "easeOut" }}
              className="rune-divider w-64"
            >
              ✦
            </motion.div>

            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.9, ease: "easeOut" }}
            >
              <h1
                className="font-display text-5xl md:text-7xl font-bold tracking-widest logo-glow"
                style={{ color: "#e8e0d0", letterSpacing: "0.15em" }}
              >
                DORA
              </h1>
              <h1
                className="font-display text-5xl md:text-7xl font-black tracking-widest"
                style={{
                  color: "#8b1e1e",
                  letterSpacing: "0.1em",
                  textShadow: "0 0 30px rgba(139,30,30,0.6), 0 0 80px rgba(139,30,30,0.2)",
                }}
              >
                DUNGEONS
              </h1>
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="font-narration italic text-lg md:text-xl"
              style={{ color: "rgba(200,155,60,0.75)", letterSpacing: "0.05em" }}
            >
              An audio-first descent into darkness
            </motion.p>

            {/* Ornamental bottom */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.4, duration: 0.9, ease: "easeOut" }}
              className="rune-divider w-64"
            >
              ✦
            </motion.div>

            {/* Skip button — visible immediately */}
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              onClick={handleSkip}
              className="mt-2 px-8 py-3 font-display text-sm tracking-widest uppercase transition-all duration-200 hover:scale-105 action-btn"
              style={{
                border: "1px solid rgba(139,30,30,0.5)",
                color: "rgba(232,224,208,0.75)",
                background: "rgba(139,30,30,0.1)",
                letterSpacing: "0.25em",
                borderRadius: "0.5rem",
              }}
              aria-label="Skip the intro and enter the dungeon"
            >
              Enter the Dungeon
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="font-code text-xs"
              style={{ color: "rgba(200,200,200,0.2)", letterSpacing: "0.1em" }}
            >
              or say "skip intro"
            </motion.p>
          </div>

          {/* Bottom vignette */}
          <div
            className="absolute bottom-0 left-0 right-0 h-32"
            style={{ background: "linear-gradient(to top, rgba(7,6,10,0.9), transparent)" }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="fade-out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50"
          style={{ background: "#07060a" }}
        />
      )}
    </AnimatePresence>
  );
}
