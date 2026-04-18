import { useEffect, useRef, useState } from "react";
import { AudioManager } from "@/audio/AudioManager";

interface IntroVideoProps {
  onComplete: () => void;
}

export function IntroVideo({ onComplete }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  };

  useEffect(() => {
    AudioManager.stopAll();

    const video = videoRef.current;
    if (!video) return;

    video.play().catch(() => setPlayBlocked(true));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      finish();
    }
  };

  return (
    <div
      role="region"
      aria-label="Intro cinematic"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#000",
        outline: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Video — pointer-events disabled so the video layer never intercepts
          touches meant for the buttons above it (critical for iOS Safari). */}
      <video
        ref={videoRef}
        src={`${import.meta.env.BASE_URL}videos/intro.mp4`}
        onEnded={finish}
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          maxWidth: "100vw",
          maxHeight: "100vh",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Skip button — responsive: smaller on mobile, positioned to avoid subtitle area.
          position:relative + high z-index ensure it is always above the video on iOS. */}
      <button
        onClick={finish}
        aria-label="Skip intro"
        style={{
          position: "absolute",
          top: "clamp(0.75rem, 3vw, 1.5rem)",
          right: "clamp(0.75rem, 3vw, 1.5rem)",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "rgba(255,255,255,0.75)",
          padding: "clamp(0.3rem, 1.2vw, 0.5rem) clamp(0.8rem, 2.5vw, 1.4rem)",
          borderRadius: "0.4rem",
          fontSize: "clamp(10px, 1.8vw, 12px)",
          fontFamily: "inherit",
          letterSpacing: "0.12em",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
          zIndex: 50,
          whiteSpace: "nowrap",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.8)";
          (e.currentTarget as HTMLButtonElement).style.color = "#fff";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.55)";
          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)";
        }}
      >
        SKIP
      </button>

      {/* Autoplay-blocked fallback overlay */}
      {playBlocked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(6,8,16,0.92)",
            zIndex: 2,
            padding: "1rem",
          }}
        >
          <p
            style={{
              color: "rgba(200,190,180,0.65)",
              fontSize: "clamp(12px, 3vw, 14px)",
              marginBottom: "1.5rem",
              letterSpacing: "0.06em",
              textAlign: "center",
            }}
          >
            Click to begin
          </p>
          <button
            onClick={() => {
              setPlayBlocked(false);
              videoRef.current?.play().catch(finish);
            }}
            aria-label="Play intro video"
            style={{
              position: "relative",
              zIndex: 50,
              background: "rgba(139,30,30,0.18)",
              border: "1px solid rgba(139,30,30,0.55)",
              color: "#f87171",
              padding: "clamp(0.6rem, 2vw, 0.8rem) clamp(1.5rem, 5vw, 2.5rem)",
              borderRadius: "0.5rem",
              fontSize: "clamp(12px, 3vw, 14px)",
              fontFamily: "inherit",
              letterSpacing: "0.14em",
              cursor: "pointer",
              marginBottom: "0.75rem",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            TAP TO ENTER
          </button>
          <button
            onClick={finish}
            aria-label="Skip intro"
            style={{
              position: "relative",
              zIndex: 50,
              background: "transparent",
              border: "none",
              color: "rgba(200,190,180,0.35)",
              fontSize: "clamp(10px, 2.5vw, 11px)",
              fontFamily: "inherit",
              letterSpacing: "0.1em",
              cursor: "pointer",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            SKIP
          </button>
        </div>
      )}
    </div>
  );
}
