/**
 * useVoiceInput
 *
 * Continuous voice recognition hook with feedback-loop protection.
 *
 * STATE MACHINE
 * ─────────────
 *   idle  ──(startListening)──▶  listening  ──(TTS starts)──▶  speaking
 *     ▲                              │  ▲                           │
 *     │                             │  └──────(TTS ends)───────────┘
 *     └────(stopListening)──────────┘
 *
 *   listening  ──(final transcript)──▶  processing  ──(400ms)──▶  listening
 *
 * DESIGN RULES
 * ────────────
 * • All caller-supplied callbacks (onFinalTranscript, etc.) are stored in refs
 *   so recognition handlers always call the latest version without recreating.
 * • _startRecognition has NO changing dependencies — it reads everything
 *   through stable refs.
 * • onend always delegates to a stable restartRef instead of calling
 *   recognition.start() directly, preventing ghost sessions.
 * • The speak-lock (AudioManager.onSpeakLock) stops recognition when TTS
 *   starts and restarts when TTS ends, preventing the feedback loop.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { AudioManager } from "@/audio/AudioManager";

export type VoiceState = "idle" | "listening" | "speaking" | "processing";

interface UseVoiceInputOptions {
  onFinalTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  language?: string;
}

interface UseVoiceInputResult {
  isSupported: boolean;
  isListening: boolean;
  voiceState: VoiceState;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

const DEBOUNCE_MS = 1000;       // ignore same command within this window
const PROCESSING_FLASH_MS = 400; // how long "processing" badge shows

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  language = "en-US",
}: UseVoiceInputOptions): UseVoiceInputResult {

  // ── Stable callback refs — always fresh, never stale in recognition handlers ──
  const onFinalRef   = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);
  const onErrorRef   = useRef(onError);
  // Keep refs in sync every render (no hooks-order change)
  onFinalRef.current   = onFinalTranscript;
  onInterimRef.current = onInterimTranscript;
  onErrorRef.current   = onError;

  // ── UI state ───────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");

  // ── Stable refs (read by event handlers — never cause re-renders on their own) ─
  const wantListeningRef   = useRef(false); // user's intent (clicked mic on)
  const isListeningRef     = useRef(false); // recognition currently running
  const isSpeakingRef      = useRef(false); // TTS currently active
  /**
   * Post-TTS cooldown: stays true for 400ms after TTS ends.
   * Discards any buffered recognition results that Chrome accumulates while
   * the speaker was talking — preventing the feedback cascade where the mic
   * picks up the last word of TTS and sends it as a new command.
   */
  const ttsCooldownRef     = useRef(false);
  const ttsCooldownTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCommandRef     = useRef({ text: "", time: 0 });
  const recognitionRef     = useRef<SpeechRecognition | null>(null);
  const micStreamRef       = useRef<MediaStream | null>(null);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const languageRef        = useRef(language);
  languageRef.current = language;

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ── Stable restart ref — onend calls this instead of recognition.start() ──
  // Using a ref so onend closures always have the latest version without deps.
  const restartRef = useRef<() => void>(() => {});

  // ── Core: create and start a fresh recognition session ────────────────────
  // No changing deps — reads everything through refs.
  const _startRecognition = useCallback(() => {
    if (!isSupported) return;
    if (isListeningRef.current) return; // already running, do nothing
    if (isSpeakingRef.current)  return; // TTS active — speak-lock will restart us

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    // Abort any existing instance to avoid ghost sessions
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
    }

    const recognition = new RecognitionCtor();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.lang            = languageRef.current;

    recognition.onstart = () => {
      console.log("[useVoiceInput] Listening started");
      isListeningRef.current = true;
      setVoiceState("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // PRIMARY GUARD — drop anything captured while TTS is playing OR during
      // the 400ms cooldown window immediately after TTS ends (Chrome buffers
      // interim results during speech which fire right after the lock releases).
      if (isSpeakingRef.current || ttsCooldownRef.current) {
        console.log("[useVoiceInput] Transcript discarded (TTS active or cooldown)");
        return;
      }

      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (!r) continue;
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += text;
        else           interim   += text;
      }

      if (interim) {
        setInterimTranscript(interim);
        onInterimRef.current?.(interim);
      }

      if (finalText.trim()) {
        setInterimTranscript("");
        const trimmed = finalText.trim();

        // DEDUPLICATION
        const now = Date.now();
        if (
          trimmed === lastCommandRef.current.text &&
          now - lastCommandRef.current.time < DEBOUNCE_MS
        ) {
          console.log("[useVoiceInput] Duplicate command suppressed:", trimmed);
          return;
        }
        lastCommandRef.current = { text: trimmed, time: now };

        // Flash "processing" badge
        setVoiceState("processing");
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current) {
            setVoiceState("listening");
          }
        }, PROCESSING_FLASH_MS);

        // Call the latest version of the callback through the ref
        onFinalRef.current(trimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return; // normal silence timeout
      if (event.error === "aborted")   return; // expected when we call .stop()

      console.warn("[useVoiceInput] Error:", event.error);
      isListeningRef.current = false;

      // Map technical error codes to spoken, user-friendly messages
      const messages: Record<string, string> = {
        "not-allowed":
          "Microphone access was denied. Please allow microphone permission and try again.",
        "audio-capture":
          "No microphone detected. Please check your microphone and try again.",
        "network":
          "Voice input lost network connection. Retrying in a moment.",
        "service-not-allowed":
          "Voice recognition is not available in this browser or context.",
      };
      const msg = messages[event.error] ??
        `Voice input not detected. Please check your microphone. Error: ${event.error}`;

      onErrorRef.current?.(msg);

      // Retry transient errors (network) after a short pause
      if (event.error === "network" && wantListeningRef.current) {
        setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current) {
            _startRecognition();
          }
        }, 2000);
      }
    };

    recognition.onend = () => {
      console.log("[useVoiceInput] Recognition ended");
      isListeningRef.current = false;
      // Delegate restart to the stable ref
      restartRef.current();
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.warn("[useVoiceInput] start() failed:", e);
      onErrorRef.current?.("Failed to start voice recognition.");
      wantListeningRef.current = false;
      setVoiceState("idle");
    }
  // isSupported is a constant after mount — safe to omit from deps array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the restartRef up to date so onend always calls the latest logic
  // (without this, the closure in recognition.onend would be forever stale)
  useEffect(() => {
    restartRef.current = () => {
      if (wantListeningRef.current && !isSpeakingRef.current) {
        // Small delay so Chrome can cleanly close the previous session
        setTimeout(_startRecognition, 80);
      } else if (!wantListeningRef.current) {
        setVoiceState("idle");
      }
      // If isSpeakingRef is true: speak-lock onend handler will call _startRecognition
    };
  }, [_startRecognition]);

  // ── Speak-lock: stops mic during TTS, restarts after ─────────────────────
  useEffect(() => {
    if (!isSupported) return;

    AudioManager.onSpeakLock((speaking: boolean) => {
      isSpeakingRef.current = speaking;

      if (speaking) {
        console.log("[useVoiceInput] Listening paused (TTS started)");
        setVoiceState("speaking");
        setInterimTranscript("");
        // Stop recognition — onend will NOT restart because isSpeakingRef=true
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch { /* ok */ }
        }
      } else {
        console.log("[useVoiceInput] TTS ended — cooldown active, mic restarts in 400ms");

        // Cooldown: keep discarding transcripts for 400ms after TTS ends.
        // Chrome buffers recognition results during speech and fires them
        // immediately after the lock releases — the cooldown catches those.
        ttsCooldownRef.current = true;
        clearTimeout(ttsCooldownTimer.current);
        ttsCooldownTimer.current = setTimeout(() => {
          ttsCooldownRef.current = false;
          console.log("[useVoiceInput] Cooldown ended — listening restored");
          if (wantListeningRef.current && !isSpeakingRef.current) {
            _startRecognition();
          } else if (!wantListeningRef.current) {
            setVoiceState("idle");
          }
        }, 400);
      }
    });
  // _startRecognition is stable (no deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  // ── Mic warm-up with echo cancellation (best-effort, non-blocking) ────────
  const _initMic = useCallback(async () => {
    if (micStreamRef.current) return;
    if (!navigator?.mediaDevices?.getUserMedia) return;
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      // Denied or unavailable — recognition still works without explicit constraints
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!isSupported) {
      onErrorRef.current?.("Voice input is not supported in this browser.");
      return;
    }
    if (wantListeningRef.current) return; // already on

    wantListeningRef.current = true;

    // Warm up mic, then start recognition
    _initMic().then(() => {
      if (wantListeningRef.current && !isSpeakingRef.current) {
        _startRecognition();
      }
    });
  }, [_initMic, _startRecognition]);

  const stopListening = useCallback(() => {
    console.log("[useVoiceInput] Listening stopped (user request)");
    wantListeningRef.current = false;
    isListeningRef.current   = false;
    setVoiceState("idle");
    setInterimTranscript("");
    clearTimeout(processingTimerRef.current);
    if (recognitionRef.current) {
      try {
        // Null out onend before stopping so the auto-restart doesn't fire
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch { /* ok */ }
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (wantListeningRef.current) stopListening();
    else                          startListening();
  }, [startListening, stopListening]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      isListeningRef.current   = false;
      ttsCooldownRef.current   = false;
      clearTimeout(processingTimerRef.current);
      clearTimeout(ttsCooldownTimer.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
      }
      micStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return {
    isSupported,
    // isListening is true during active recognition AND brief processing flash
    isListening: voiceState === "listening" || voiceState === "processing",
    voiceState,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
