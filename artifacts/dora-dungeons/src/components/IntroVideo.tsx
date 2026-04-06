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
    // Stop all TTS/voice queued so far — the video window is completely silent
    // from the game's audio perspective.
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
      }}
    >
      {/* Video fills the entire viewport */}
      <video
        ref={videoRef}
        src={`${import.meta.env.BASE_URL}videos/intro.mp4`}
        onEnded={finish}
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
        aria-hidden="true"
      />

      {/* Skip button — always visible */}
      <button
        onClick={finish}
        aria-label="Skip intro"
        style={{
          position: "absolute",
          bottom: "2rem",
          right: "2rem",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "rgba(255,255,255,0.75)",
          padding: "0.5rem 1.4rem",
          borderRadius: "0.4rem",
          fontSize: "12px",
          fontFamily: "inherit",
          letterSpacing: "0.12em",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
          zIndex: 1,
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
          }}
        >
          <p
            style={{
              color: "rgba(200,190,180,0.65)",
              fontSize: "14px",
              marginBottom: "1.5rem",
              letterSpacing: "0.06em",
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
              background: "rgba(139,30,30,0.18)",
              border: "1px solid rgba(139,30,30,0.55)",
              color: "#f87171",
              padding: "0.8rem 2.5rem",
              borderRadius: "0.5rem",
              fontSize: "14px",
              fontFamily: "inherit",
              letterSpacing: "0.14em",
              cursor: "pointer",
              marginBottom: "0.75rem",
            }}
          >
            PLAY
          </button>
          <button
            onClick={finish}
            aria-label="Skip intro"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(200,190,180,0.35)",
              fontSize: "11px",
              fontFamily: "inherit",
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            SKIP
          </button>
        </div>
      )}
    </div>
  );
}
