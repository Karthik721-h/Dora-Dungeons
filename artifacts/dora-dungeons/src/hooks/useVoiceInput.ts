/**
 * useVoiceInput — Single controlled speak→listen lifecycle
 *
 * LIFECYCLE OWNERSHIP (one path per scenario, no races)
 * ─────────────────────────────────────────────────────
 *
 * A. Initial auto-start (game load)
 *    GameScreen calls startListening() inside onQueueDrained.
 *    At that moment the TTS cooldown is still active (TTS just ended).
 *    → startListening sets wantListeningRef = true and returns.
 *    → 400ms cooldown expires → _startRecognition() [SINGLE START PATH for after-TTS]
 *
 * B. Natural silence timeout (Chrome stops recognition on its own)
 *    recognition.onend fires → restartRef() → isSpeaking=false, cooldown=false
 *    → _startRecognition() after 80ms  [ONLY path for natural restarts]
 *
 * C. TTS starts mid-session
 *    speakLock(true) → recognition.stop() → recognition.onend fires
 *    → restartRef() sees isSpeaking=true → does nothing
 *    TTS ends → speakLock(false) → cooldown 400ms → _startRecognition()  [ONLY path after TTS]
 *
 * GUARD FLAGS
 * ───────────
 * • wantListeningRef  – user intent (true after startListening is called)
 * • isListeningRef    – recognition actually running
 * • isSpeakingRef     – TTS active (speak-lock)
 * • ttsCooldownRef    – 400ms post-TTS window (transcripts discarded, start deferred)
 *
 * _startRecognition blocks on: isListeningRef OR isSpeakingRef OR ttsCooldownRef
 * startListening defers to cooldown: if ttsCooldownRef is active, set intent and exit.
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

const DEBOUNCE_MS       = 1000; // ignore same command within this window
const PROCESSING_MS     = 400;  // "processing" badge duration
const TTS_COOLDOWN_MS   = 500;  // discard buffered TTS transcripts after speech ends
const SILENCE_TIMEOUT_MS = 3500; // auto-submit after 3.5 s of silence with interim text

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  language = "en-US",
}: UseVoiceInputOptions): UseVoiceInputResult {

  // ── Stable callback refs — always fresh inside event handlers ─────────────
  const onFinalRef   = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);
  const onErrorRef   = useRef(onError);
  onFinalRef.current   = onFinalTranscript;
  onInterimRef.current = onInterimTranscript;
  onErrorRef.current   = onError;

  // ── UI state ───────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");

  // ── Guard flags (refs — zero re-renders, always current in callbacks) ──────
  const wantListeningRef        = useRef(false); // user intent
  const isListeningRef          = useRef(false); // recognition running
  const isSpeakingRef           = useRef(false); // TTS active
  const ttsCooldownRef          = useRef(false); // post-TTS transcript discard window
  const isProcessingCommandRef  = useRef(false); // final transcript received, awaiting TTS response

  // ── Timers ─────────────────────────────────────────────────────────────────
  const cooldownTimerRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Silence detection: fires 1.5 s after the last onresult event so we can
  // auto-submit interim text if the browser never delivers a final result.
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Tracks the most-recent interim transcript across onresult calls so the
  // silence timeout can submit it even though the original closure is gone.
  const currentTranscriptRef = useRef<string>("");

  // ── Misc ───────────────────────────────────────────────────────────────────
  const lastCommandRef = useRef({ text: "", time: 0 });
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micStreamRef   = useRef<MediaStream | null>(null);
  const languageRef    = useRef(language);
  languageRef.current  = language;

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Android Chrome's SpeechRecognition silently zombies with continuous=true:
  // onstart fires but onend never does, leaving isListeningRef stuck at true.
  // Using continuous=false lets each utterance end cleanly (onend always fires)
  // and the existing Scenario B restart loop keeps recognition alive continuously.
  const isAndroid =
    typeof navigator !== "undefined" &&
    /android/i.test(navigator.userAgent);

  // ── Stable restart ref used by recognition.onend ──────────────────────────
  // Updated via useEffect so it's never stale inside the onend closure.
  const restartRef = useRef<() => void>(() => {});

  // ── Core: start a fresh recognition session ───────────────────────────────
  // THREE HARD GUARDS — blocks if any are true:
  //   isListeningRef  → already running, no duplicate
  //   isSpeakingRef   → TTS active; cooldown timer will start us after it ends
  //   ttsCooldownRef  → post-TTS buffer window; cooldown timer will start us after
  const _startRecognition = useCallback(() => {
    if (!isSupported)            return;
    if (isListeningRef.current)  return; // already running
    if (isSpeakingRef.current)   return; // TTS active — cooldown handles restart
    if (ttsCooldownRef.current)  return; // cooldown active — cooldown handles restart

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    // Release the warm-up getUserMedia stream before starting recognition.
    // On Android Chrome, keeping an explicit mic stream alive while SpeechRecognition
    // also tries to claim the mic can cause the recognition engine to receive no audio.
    // Freeing it here lets the recognition engine take exclusive access cleanly.
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    // Kill any existing instance to prevent ghost sessions
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
    }

    const recognition = new RecognitionCtor();
    // Android Chrome zombies silently with continuous=true — use false so onend
    // always fires and the Scenario B restart loop keeps recognition alive.
    recognition.continuous      = !isAndroid;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.lang            = languageRef.current;

    recognition.onstart = () => {
      console.log("[useVoiceInput] Listening started");
      isListeningRef.current = true;
      setVoiceState("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Drop anything captured while TTS is active or during the post-TTS buffer window
      if (isSpeakingRef.current || ttsCooldownRef.current) {
        console.log("[useVoiceInput] Transcript discarded (TTS active or cooldown)");
        return;
      }
      // Gate 1: if a command is already in-flight, discard interim/duplicate results
      if (isProcessingCommandRef.current) return;

      // ── Silence detection: reset the timer on every onresult event ───────────
      // Any speech activity postpones the timeout by another 1.5 s.
      clearTimeout(silenceTimerRef.current);

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
        // Keep a stable ref so the silence-timeout callback can access it even
        // after this closure has returned.
        currentTranscriptRef.current = interim;

        // Arm the 1.5 s silence timer.  If no more speech comes in and the
        // browser never delivers a final result, auto-submit what we heard.
        silenceTimerRef.current = setTimeout(() => {
          const pending = currentTranscriptRef.current.trim();
          if (!pending || isProcessingCommandRef.current || isSpeakingRef.current) return;

          // Discard obvious noise/garbage: require at least 2 words so single-word
          // ambient fragments ("hm", "uh", stray sounds) never fire a command.
          const wordCount = pending.split(/\s+/).filter(w => w.length > 1).length;
          if (wordCount < 2) {
            currentTranscriptRef.current = "";
            setInterimTranscript("");
            return;
          }

          currentTranscriptRef.current = "";
          setInterimTranscript("");
          console.log("[useVoiceInput] Silence timeout — auto-submitting:", pending);

          // Deduplication
          const now = Date.now();
          if (
            pending === lastCommandRef.current.text &&
            now - lastCommandRef.current.time < DEBOUNCE_MS
          ) return;
          lastCommandRef.current = { text: pending, time: now };

          // Stop the mic so it doesn't keep listening after we submit
          if (recognitionRef.current && isListeningRef.current) {
            try { recognitionRef.current.stop(); } catch { /* ok */ }
          }

          setVoiceState("processing");
          clearTimeout(processingTimerRef.current);
          processingTimerRef.current = setTimeout(() => {
            if (wantListeningRef.current && !isSpeakingRef.current) setVoiceState("listening");
          }, PROCESSING_MS);

          isProcessingCommandRef.current = true;
          onFinalRef.current(pending);
        }, SILENCE_TIMEOUT_MS);
      }

      if (finalText.trim()) {
        // Final result received — clear the silence timer and the buffered text;
        // the normal submission path below handles everything.
        clearTimeout(silenceTimerRef.current);
        currentTranscriptRef.current = "";
        setInterimTranscript("");
        const trimmed = finalText.trim();

        // Deduplication — same phrase within 1s is ignored
        const now = Date.now();
        if (
          trimmed === lastCommandRef.current.text &&
          now - lastCommandRef.current.time < DEBOUNCE_MS
        ) {
          console.log("[useVoiceInput] Duplicate command suppressed:", trimmed);
          return;
        }
        lastCommandRef.current = { text: trimmed, time: now };

        // Brief "processing" badge
        setVoiceState("processing");
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current) {
            setVoiceState("listening");
          }
        }, PROCESSING_MS);

        // Lock: command is now in-flight — block onresult and onend restart until TTS responds
        isProcessingCommandRef.current = true;
        onFinalRef.current(trimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return; // normal silence
      if (event.error === "aborted")   return; // expected from .stop()
      if (isSpeakingRef.current)       return; // TTS stopped recognition — not a real error

      console.warn("[useVoiceInput] Error:", event.error);
      isListeningRef.current = false;

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
        `Voice input not detected. Please check your microphone.`;
      onErrorRef.current?.(msg);

      // Auto-retry on transient network errors only
      if (event.error === "network" && wantListeningRef.current) {
        setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current && !ttsCooldownRef.current) {
            _startRecognition();
          }
        }, 2000);
      }
    };

    // recognition.onend → delegates to restartRef (scenario B: natural silence)
    recognition.onend = () => {
      console.log("[useVoiceInput] Recognition ended");
      isListeningRef.current = false;
      // Safety Net: if TTS is active or a command is still in-flight, the
      // speak-lock/cooldown path owns the restart — do not race it.
      if (isSpeakingRef.current) return;
      if (isProcessingCommandRef.current) return;
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
  // isSupported is constant after mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep restartRef current without creating stale closures ───────────────
  useEffect(() => {
    restartRef.current = () => {
      // Scenario B: natural silence timeout — only restart if not blocked
      if (wantListeningRef.current && !isSpeakingRef.current && !ttsCooldownRef.current && !isProcessingCommandRef.current) {
        setTimeout(() => {
          // Double-check all guards still clear after the delay
          if (!isSpeakingRef.current && !isProcessingCommandRef.current) {
            _startRecognition();
          }
        }, 500);
      } else if (!wantListeningRef.current) {
        setVoiceState("idle");
      }
      // isSpeaking=true, cooldown=true, or isProcessingCommand=true: owning path handles restart
    };
  }, [_startRecognition]);

  // ── Speak-lock + cooldown (scenario C: TTS-triggered restart) ────────────
  // This is the SINGLE owner of "restart after TTS ends".
  useEffect(() => {
    if (!isSupported) return;

    AudioManager.onSpeakLock((speaking: boolean) => {
      isSpeakingRef.current = speaking;

      if (speaking) {
        // TTS started — pause recognition immediately.
        // Only call .stop() when recognition is actually running; calling it on
        // an already-ended session can trigger a spurious onend in Chrome which
        // perturbs the lifecycle state.
        console.log("[useVoiceInput] Listening paused (TTS started)");
        // Gate 2: TTS has taken the command response — release the processing lock
        isProcessingCommandRef.current = false;
        setVoiceState("speaking");
        setInterimTranscript("");
        if (recognitionRef.current && isListeningRef.current) {
          try { recognitionRef.current.stop(); } catch { /* ok */ }
        }
      } else {
        // TTS ended — start cooldown window
        console.log("[useVoiceInput] TTS ended — cooldown started");
        // Safety: ensure command lock is clear before cooldown starts
        isProcessingCommandRef.current = false;
        ttsCooldownRef.current = true;
        clearTimeout(cooldownTimerRef.current);

        cooldownTimerRef.current = setTimeout(() => {
          ttsCooldownRef.current = false;
          console.log("[useVoiceInput] Cooldown cleared — starting recognition");

          // Single restart point after TTS: if user wants to listen, start now
          if (wantListeningRef.current && !isSpeakingRef.current) {
            _startRecognition();
          } else if (!wantListeningRef.current) {
            setVoiceState("idle");
          }
        }, TTS_COOLDOWN_MS);
      }
    });

    // De-register on unmount / re-render so a stale closure cannot fire
    // after the hook has torn down its refs and timers.
    return () => AudioManager.onSpeakLock(null);
  // _startRecognition is stable (no deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  // ── Mic warm-up (echo cancellation — best-effort, non-blocking) ───────────
  const _initMic = useCallback(async () => {
    if (micStreamRef.current) return;
    if (!navigator?.mediaDevices?.getUserMedia) return;
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      // Continue without explicit constraints — recognition still works
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!isSupported) {
      onErrorRef.current?.("Voice input is not supported in this browser.");
      return;
    }
    if (wantListeningRef.current) return; // already on — prevent double-init

    wantListeningRef.current = true;

    // Warm up mic, then start recognition — BUT if the TTS cooldown is still
    // active (e.g. called from onQueueDrained right after narration ends), defer
    // to the cooldown timer which will call _startRecognition when it expires.
    // This is the single controlled lifecycle path for initial auto-start.
    _initMic().then(() => {
      if (!wantListeningRef.current || isSpeakingRef.current) return;
      if (ttsCooldownRef.current) {
        console.log("[useVoiceInput] startListening deferred — TTS cooldown active");
        // Cooldown timer will call _startRecognition() when it expires
        return;
      }
      _startRecognition();
    });
  }, [_initMic, _startRecognition]);

  const stopListening = useCallback(() => {
    console.log("[useVoiceInput] Listening stopped (user request)");
    wantListeningRef.current       = false;
    isListeningRef.current         = false;
    ttsCooldownRef.current         = false;
    isProcessingCommandRef.current = false;
    currentTranscriptRef.current   = "";
    setVoiceState("idle");
    setInterimTranscript("");
    clearTimeout(processingTimerRef.current);
    clearTimeout(cooldownTimerRef.current);
    clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch { /* ok */ }
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (wantListeningRef.current) stopListening();
    else                          startListening();
  }, [startListening, stopListening]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      wantListeningRef.current       = false;
      isListeningRef.current         = false;
      ttsCooldownRef.current         = false;
      isProcessingCommandRef.current = false;
      currentTranscriptRef.current   = "";
      clearTimeout(processingTimerRef.current);
      clearTimeout(cooldownTimerRef.current);
      clearTimeout(silenceTimerRef.current);
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
  };
}
