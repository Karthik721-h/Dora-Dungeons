/**
 * useVoiceInput — Single controlled speak→listen lifecycle
 *
 * MOBILE BEHAVIOUR
 * ────────────────
 * iOS (PTT mode):
 *   Every recognition.start() must be a direct user gesture.
 *   → recognition.continuous = false; user taps mic before each command.
 *   → After each utterance (or timeout), resets to "needs activation" state.
 *   → TTS cooldown also resets to "needs activation" instead of auto-restarting.
 *
 * Android (tap-to-activate):
 *   First start requires user gesture (to get mic permission).
 *   → Show "tap mic to activate" on initial render.
 *   → After first tap, auto-restart from onend works normally.
 *
 * Desktop:
 *   Fully automatic — startListening() called after TTS ends (onQueueDrained).
 *   continuous = true; auto-restarts silently.
 *
 * KEY FIX vs old code:
 *   Old code called _initMic().then(() => _startRecognition()). The .then()
 *   microtask breaks the "user gesture" propagation chain that mobile browsers
 *   require for recognition.start().  Now _startRecognition() is always called
 *   SYNCHRONOUSLY from startListening(), preserving the gesture context.
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
  /** True on iOS — user must tap mic before each utterance */
  isPTT: boolean;
  /** True until user taps the mic button for the first time on mobile */
  needsActivation: boolean;
}

const DEBOUNCE_MS     = 1000;
const PROCESSING_MS   = 400;
const TTS_COOLDOWN_MS = 500;

// ── Platform detection (evaluated once at module level) ────────────────────
const UA = typeof navigator !== "undefined" ? navigator.userAgent : "";
const IS_IOS     = /iPhone|iPad|iPod/i.test(UA) && !("MSStream" in window);
const IS_ANDROID = /Android/i.test(UA) && !IS_IOS;
const IS_MOBILE  = IS_IOS || IS_ANDROID;

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  language = "en-US",
}: UseVoiceInputOptions): UseVoiceInputResult {

  // ── Stable callback refs ────────────────────────────────────────────────
  const onFinalRef   = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);
  const onErrorRef   = useRef(onError);
  onFinalRef.current   = onFinalTranscript;
  onInterimRef.current = onInterimTranscript;
  onErrorRef.current   = onError;

  // ── UI state ────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  // Mobile: true until user taps the mic for the first time
  const [needsActivation, setNeedsActivation] = useState(IS_MOBILE);

  // ── Guard flags ─────────────────────────────────────────────────────────
  const wantListeningRef   = useRef(false);
  const isListeningRef     = useRef(false);
  const isSpeakingRef      = useRef(false);
  const ttsCooldownRef     = useRef(false);
  const needsActivationRef = useRef(IS_MOBILE);

  // ── Timers ──────────────────────────────────────────────────────────────
  const cooldownTimerRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Misc ────────────────────────────────────────────────────────────────
  const lastCommandRef = useRef({ text: "", time: 0 });
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micStreamRef   = useRef<MediaStream | null>(null);
  const languageRef    = useRef(language);
  languageRef.current  = language;

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ── PTT mode: iOS requires a user gesture before every start() ──────────
  const isPTT = IS_IOS;

  const restartRef = useRef<() => void>(() => {});

  // ── Mark as "needs activation again" (mobile tap prompt) ───────────────
  const _requireActivation = useCallback(() => {
    if (!IS_MOBILE) return;
    needsActivationRef.current = true;
    setNeedsActivation(true);
    wantListeningRef.current = false;
    setVoiceState("idle");
  }, []);

  // ── Core: start a fresh recognition session ────────────────────────────
  // MUST be called synchronously within a user-gesture handler on mobile.
  const _startRecognition = useCallback(() => {
    if (!isSupported)           return;
    if (isListeningRef.current) return;
    if (isSpeakingRef.current)  return;
    if (ttsCooldownRef.current) return;

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
    }

    const recognition = new RecognitionCtor();
    // iOS PTT: continuous=false stops naturally after one utterance
    recognition.continuous      = !isPTT;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.lang            = languageRef.current;

    recognition.onstart = () => {
      console.log("[useVoiceInput] Listening started");
      isListeningRef.current = true;
      setVoiceState("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

        const now = Date.now();
        if (
          trimmed === lastCommandRef.current.text &&
          now - lastCommandRef.current.time < DEBOUNCE_MS
        ) {
          console.log("[useVoiceInput] Duplicate command suppressed:", trimmed);
          return;
        }
        lastCommandRef.current = { text: trimmed, time: now };

        setVoiceState("processing");
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current) {
            setVoiceState("listening");
          }
        }, PROCESSING_MS);

        onFinalRef.current(trimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return;
      if (event.error === "aborted")   return;
      if (isSpeakingRef.current)       return;

      console.warn("[useVoiceInput] Error:", event.error);
      isListeningRef.current = false;

      const messages: Record<string, string> = {
        "not-allowed":
          "Microphone access was denied. Please allow microphone permission in your browser settings and try again.",
        "audio-capture":
          "No microphone detected. Please check your microphone and try again.",
        "network":
          "Voice input lost network connection. Retrying in a moment.",
        "service-not-allowed":
          "Voice recognition is not available in this browser or context.",
      };
      const msg = messages[event.error] ??
        "Voice input error. Please tap the mic button to try again.";
      onErrorRef.current?.(msg);

      if (event.error === "network" && wantListeningRef.current) {
        setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current && !ttsCooldownRef.current) {
            _startRecognition();
          }
        }, 2000);
      }

      // On any error on mobile, reset to tap prompt
      if (IS_MOBILE) _requireActivation();
    };

    recognition.onend = () => {
      console.log("[useVoiceInput] Recognition ended");
      isListeningRef.current = false;
      restartRef.current();
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.warn("[useVoiceInput] start() failed:", e);
      onErrorRef.current?.("Failed to start voice recognition. Please tap the mic to try again.");
      wantListeningRef.current = false;
      setVoiceState("idle");
      if (IS_MOBILE) _requireActivation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPTT, _requireActivation]);

  // ── Keep restartRef current ─────────────────────────────────────────────
  useEffect(() => {
    restartRef.current = () => {
      if (isPTT) {
        // PTT: recognition ended (either after utterance or timeout).
        // Don't auto-restart — wait for next user tap.
        // If TTS is about to play, speakLock will handle the cooldown reset.
        if (!isSpeakingRef.current && !ttsCooldownRef.current) {
          _requireActivation();
        }
        return;
      }
      // Desktop / Android continuous mode
      if (wantListeningRef.current && !isSpeakingRef.current && !ttsCooldownRef.current) {
        setTimeout(_startRecognition, 80);
      } else if (!wantListeningRef.current) {
        setVoiceState("idle");
      }
    };
  }, [_startRecognition, _requireActivation, isPTT]);

  // ── Speak-lock + TTS cooldown ───────────────────────────────────────────
  useEffect(() => {
    if (!isSupported) return;

    AudioManager.onSpeakLock((speaking: boolean) => {
      isSpeakingRef.current = speaking;

      if (speaking) {
        console.log("[useVoiceInput] Listening paused (TTS started)");
        setVoiceState("speaking");
        setInterimTranscript("");
        if (recognitionRef.current && isListeningRef.current) {
          try { recognitionRef.current.stop(); } catch { /* ok */ }
        }
      } else {
        // TTS ended — start cooldown window
        console.log("[useVoiceInput] TTS ended — cooldown started");
        ttsCooldownRef.current = true;
        clearTimeout(cooldownTimerRef.current);

        cooldownTimerRef.current = setTimeout(() => {
          ttsCooldownRef.current = false;
          console.log("[useVoiceInput] Cooldown cleared");

          if (isPTT) {
            // iOS PTT: TTS done → user must tap mic again
            _requireActivation();
            return;
          }

          // Desktop / Android: auto-restart if user wants to listen
          if (wantListeningRef.current && !isSpeakingRef.current) {
            _startRecognition();
          } else if (!wantListeningRef.current) {
            setVoiceState("idle");
          }
        }, TTS_COOLDOWN_MS);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, isPTT, _startRecognition, _requireActivation]);

  // ── Mic warm-up (echo cancellation, background, non-blocking) ─────────
  const _initMic = useCallback(async () => {
    if (micStreamRef.current) return;
    if (!navigator?.mediaDevices?.getUserMedia) return;
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      // Continue — recognition handles its own mic permission
    }
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * startListening — request voice capture.
   *
   * On mobile, if called from an async context (e.g. after TTS), recognition
   * is NOT started immediately (no user gesture). Instead, sets wantListeningRef
   * so the next user tap will pick it up.
   *
   * On desktop, starts recognition synchronously.
   */
  const startListening = useCallback(() => {
    if (!isSupported) {
      onErrorRef.current?.("Voice input is not supported in this browser.");
      return;
    }
    if (wantListeningRef.current) return;

    // Mobile: if the user hasn't tapped the mic yet, do NOT set wantListeningRef.
    // This prevents toggleListening() from thinking we are "listening" and going
    // into the stop branch instead of the start branch when the user taps the mic.
    if (needsActivationRef.current) {
      console.log("[useVoiceInput] Mobile: need user gesture — startListening deferred");
      return;
    }

    wantListeningRef.current = true;
    if (isSpeakingRef.current) return;
    if (ttsCooldownRef.current) return;
    _startRecognition();
  }, [_startRecognition, isSupported]);

  const stopListening = useCallback(() => {
    console.log("[useVoiceInput] Listening stopped (user request)");
    wantListeningRef.current = false;
    isListeningRef.current   = false;
    ttsCooldownRef.current   = false;
    setVoiceState("idle");
    setInterimTranscript("");
    clearTimeout(processingTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
    }
  }, []);

  /**
   * toggleListening — MUST be called from a direct user-gesture handler (onClick).
   *
   * On mobile: clears needsActivation so _startRecognition() runs synchronously
   * within the gesture, satisfying browser user-gesture requirements.
   *
   * Smart behaviour: if intent is set (wantListening=true) but recognition is
   * NOT actually running, treat this as a restart request rather than a stop.
   * This lets users recover from stuck/dead recognition by tapping the mic.
   */
  const toggleListening = useCallback(() => {
    const actuallyListening = isListeningRef.current;
    const wantsToListen     = wantListeningRef.current;

    if (wantsToListen && actuallyListening) {
      // Recognition is running → user wants to stop
      stopListening();
      if (IS_MOBILE) _requireActivation();
    } else {
      // Either not started yet, or intent set but recognition died → restart.
      // Clear mobile activation gate — this call IS a user gesture.
      if (needsActivationRef.current) {
        needsActivationRef.current = false;
        setNeedsActivation(false);
        _initMic().catch(() => {});
      }
      // Set intent and start directly (synchronous — gesture is preserved)
      wantListeningRef.current = true;
      if (!isSpeakingRef.current && !ttsCooldownRef.current) {
        _startRecognition();
      }
    }
  }, [stopListening, _startRecognition, _requireActivation, _initMic]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      isListeningRef.current   = false;
      ttsCooldownRef.current   = false;
      clearTimeout(processingTimerRef.current);
      clearTimeout(cooldownTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
      }
      micStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return {
    isSupported,
    isListening: voiceState === "listening" || voiceState === "processing",
    voiceState,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
    isPTT,
    needsActivation,
  };
}
