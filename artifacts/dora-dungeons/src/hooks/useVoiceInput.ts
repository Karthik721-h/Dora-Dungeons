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
 * FEEDBACK LOOP PREVENTION
 * ────────────────────────
 * 1. AudioManager fires `onSpeakLock(cb)` when TTS starts/ends.
 * 2. On TTS start: isSpeakingRef = true, recognition.stop() (so mic never
 *    hears TTS output).
 * 3. On TTS end: isSpeakingRef = false, recognition restarts automatically
 *    if the user still wants to listen (wantListeningRef = true).
 * 4. Every final transcript is guarded: if isSpeakingRef is true, discard.
 * 5. 1000ms command deduplication prevents double-firing the same phrase.
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

// How long the same transcript is ignored to prevent duplicate commands (ms)
const DEBOUNCE_MS = 1000;
// How long "processing" state is shown before returning to "listening" (ms)
const PROCESSING_FLASH_MS = 400;

export function useVoiceInput({
  onFinalTranscript,
  onInterimTranscript,
  onError,
  language = "en-US",
}: UseVoiceInputOptions): UseVoiceInputResult {

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");

  // Refs — used inside event handlers so they always see the latest value
  /** User's intent: did they click the mic on? */
  const wantListeningRef = useRef(false);
  /** Is recognition currently running? */
  const isListeningRef = useRef(false);
  /** Is TTS currently speaking? (updated by AudioManager speak-lock) */
  const isSpeakingRef = useRef(false);
  /** Last accepted command text + timestamp — for deduplication */
  const lastCommandRef = useRef({ text: "", time: 0 });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ── Speak-lock subscription (prevents feedback loop) ──────────────────────

  useEffect(() => {
    if (!isSupported) return;

    AudioManager.onSpeakLock((speaking: boolean) => {
      isSpeakingRef.current = speaking;

      if (speaking) {
        // TTS started — immediately suspend recognition so mic doesn't hear it
        console.log("[useVoiceInput] Listening stopped (TTS started)");
        setVoiceState("speaking");
        setInterimTranscript("");
        if (recognitionRef.current && isListeningRef.current) {
          try {
            recognitionRef.current.stop();
            // isListeningRef stays as-is; onend will check isSpeakingRef
          } catch {
            // already stopped
          }
        }
      } else {
        // TTS ended — restart recognition if the user still wants to listen
        console.log("[useVoiceInput] TTS ended — checking restart");
        if (wantListeningRef.current) {
          // Small delay so the last TTS audio fully drains from the mic
          setTimeout(() => {
            if (wantListeningRef.current && !isSpeakingRef.current) {
              _startRecognition();
            }
          }, 300);
        } else {
          setVoiceState("idle");
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  // ── Mic initialisation (echo cancellation) ────────────────────────────────

  const _initMic = useCallback(async () => {
    if (micStreamRef.current) return; // already acquired
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      // Permission denied or unavailable — recognition still works, just
      // without explicit echo cancellation constraints.
    }
  }, []);

  // ── Recognition lifecycle ─────────────────────────────────────────────────

  const _startRecognition = useCallback(() => {
    if (!isSupported) return;
    if (isListeningRef.current) return; // already running
    if (isSpeakingRef.current) return;  // TTS active — do not start

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = language;

    recognition.onstart = () => {
      console.log("[useVoiceInput] Listening started");
      isListeningRef.current = true;
      setVoiceState("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // PRIMARY GUARD — discard anything heard while TTS is active
      if (isSpeakingRef.current) {
        console.log("[useVoiceInput] Transcript discarded (TTS speaking)");
        return;
      }

      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += text;
        } else {
          interim += text;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
        onInterimTranscript?.(interim);
      }

      if (finalText.trim()) {
        setInterimTranscript("");
        const trimmed = finalText.trim();

        // DEDUPLICATION — ignore same command within the debounce window
        const now = Date.now();
        if (
          trimmed === lastCommandRef.current.text &&
          now - lastCommandRef.current.time < DEBOUNCE_MS
        ) {
          console.log("[useVoiceInput] Duplicate command ignored:", trimmed);
          return;
        }
        lastCommandRef.current = { text: trimmed, time: now };

        // Brief "processing" flash
        setVoiceState("processing");
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = setTimeout(() => {
          if (wantListeningRef.current && !isSpeakingRef.current) {
            setVoiceState("listening");
          }
        }, PROCESSING_FLASH_MS);

        onFinalTranscript(trimmed);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return;
      if (event.error === "aborted") return; // expected when we call .stop()
      onError?.(`Voice error: ${event.error}`);
      isListeningRef.current = false;
      setVoiceState(wantListeningRef.current ? "idle" : "idle");
    };

    recognition.onend = () => {
      console.log("[useVoiceInput] Recognition ended");
      isListeningRef.current = false;

      // Auto-restart only if:
      //   • user still wants to listen
      //   • TTS is NOT currently speaking (restart is handled by speak-lock instead)
      if (wantListeningRef.current && !isSpeakingRef.current) {
        try {
          recognition.start();
        } catch {
          wantListeningRef.current = false;
          setVoiceState("idle");
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      onError?.("Failed to start voice recognition.");
      wantListeningRef.current = false;
      setVoiceState("idle");
    }
  }, [isSupported, language, onFinalTranscript, onInterimTranscript, onError]);

  // ── Public API ────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!isSupported) {
      onError?.("Voice input is not supported in this browser.");
      return;
    }
    if (wantListeningRef.current) return; // already on

    wantListeningRef.current = true;

    // Init mic with echo cancellation constraints, then start recognition
    _initMic().then(() => {
      if (wantListeningRef.current && !isSpeakingRef.current) {
        _startRecognition();
      }
    });
  }, [isSupported, onError, _initMic, _startRecognition]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    isListeningRef.current = false;
    setVoiceState("idle");
    setInterimTranscript("");
    clearTimeout(processingTimerRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
    }
    console.log("[useVoiceInput] Listening stopped (user request)");
  }, []);

  const toggleListening = useCallback(() => {
    if (wantListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      isListeningRef.current = false;
      clearTimeout(processingTimerRef.current);
      try { recognitionRef.current?.stop(); } catch { /* */ }
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
