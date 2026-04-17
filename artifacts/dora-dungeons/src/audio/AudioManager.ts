/**
 * AudioManager
 *
 * Central audio controller for Dora Dungeons.
 * Handles narration via Web Speech Synthesis and spatial cues via Web Audio API.
 *
 * Voice selection priority (female-first):
 *   1. "Google UK English Female"
 *   2. "Google US English"
 *   3. "Samantha" (macOS)
 *   4. "Microsoft Zira Desktop" / "Microsoft Zira" (Windows)
 *   5. Any voice whose name contains "Female" or "Woman"
 *   6. First available voice (fallback)
 *
 * NOTE: SpeechSynthesis voices load asynchronously in Chrome/Edge.
 *       initializeVoices() must be called on app load and the manager
 *       also listens for `voiceschanged` to repopulate when they arrive.
 *
 * Designed so `_speakWithSynthesis` can be swapped for an external TTS
 * provider (e.g. ElevenLabs) without touching the public API.
 */

export type AudioChannel = "narration" | "ambient" | "effects";

interface QueueEntry {
  text: string;
  pan?: number;
}

/** Priority-ordered preferred female voice names. */
const FEMALE_VOICE_NAMES: string[] = [
  "Google UK English Female",
  "Google US English",
  "Samantha",
  "Microsoft Zira Desktop",
  "Microsoft Zira",
];

/** Priority-ordered preferred male voice names. */
const MALE_VOICE_NAMES: string[] = [
  "Google UK English Male",
  "Daniel",
  "Alex",
  "Microsoft David Desktop",
  "Microsoft David",
  "Microsoft Mark",
  "Fred",
];

const VOICE_GENDER_KEY = "dd_voice_gender";

class AudioManagerClass {
  // ── Narration ──────────────────────────────────────────────────────────────
  private narrationQueue: QueueEntry[] = [];
  private isSpeaking = false;
  private lastText = "";
  /**
   * Monotonically increasing counter — incremented each time a new utterance
   * starts.  Each utterance closure captures its own value (mySeq) and
   * compares against this.utteranceSeq in onend/onerror.  If they differ, the
   * event belongs to a cancelled/stale utterance and must be ignored.
   */
  private utteranceSeq = 0;

  // ── Voice ──────────────────────────────────────────────────────────────────
  /** The resolved preferred voice (null until voices load). */
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;
  /** Current gender preference — persisted to localStorage. */
  private voiceGender: "female" | "male" = "female";

  // ── Audio parameters (user-adjustable) ────────────────────────────────────
  /**
   * Base rate for clarity. 0.95 keeps speech natural without rushing.
   * The user's ± controls adjust this value (0.5–2.0 clamp).
   */
  private rate = 0.95;
  /**
   * Base pitch: 1.2 gives a clear, slightly feminine tone.
   * Male mode uses 0.9 for a deeper register.
   * Adjustable via setPitch().
   */
  private pitch = 1.2;

  // ── Misc ───────────────────────────────────────────────────────────────────
  private audioCtx: AudioContext | null = null;
  private onSpeakingChange?: (speaking: boolean) => void;

  /**
   * Speak-lock callback.
   * Registered by useVoiceInput so recognition stops while TTS is active
   * and restarts when TTS finishes.  Fired BEFORE onSpeakingChange so the
   * hook can abort recognition before the UI repaints.
   */
  private speakLockCallback?: (isSpeaking: boolean) => void;

  /**
   * One-shot queue-drained callback.
   * Fires ONCE when the narration queue fully empties (the last utterance ends
   * and nothing is queued behind it).  Automatically clears itself after firing
   * so it cannot trigger twice.  Used by GameScreen to auto-start listening
   * after the welcome + room-description narration finishes.
   */
  private queueDrainedCallback?: () => void;

  // ── Voice initialisation ────────────────────────────────────────────────────

  /**
   * Call once on app start (e.g. in main.tsx or App.tsx useEffect).
   * Safe to call multiple times — idempotent.
   *
   * Chrome/Edge load voices asynchronously; this method handles both
   * the synchronous case (voices already available) and the async case
   * (onvoiceschanged fires later).
   */
  initializeVoices() {
    if (!("speechSynthesis" in window)) return;

    // Load persisted gender preference
    try {
      const saved = localStorage.getItem(VOICE_GENDER_KEY);
      if (saved === "male" || saved === "female") {
        this.voiceGender = saved;
        this.pitch = saved === "male" ? 0.9 : 1.2;
      }
    } catch { /* localStorage unavailable */ }

    const populate = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return; // not yet ready
      this.selectedVoice = this.getPreferredVoice(voices);
      this.voicesLoaded = true;
    };

    // Try immediately (works in Firefox and sometimes Safari)
    populate();

    // Subscribe for async load (Chrome / Edge)
    window.speechSynthesis.onvoiceschanged = () => populate();

    // Chrome / Edge have a well-known bug: the SpeechSynthesis engine silently
    // enters a "paused" state after running for a while, causing all subsequent
    // speak() calls to queue but never play.  This watchdog detects the pause
    // and calls resume() every 5 s so the engine stays alive.
    this._startChromeWatchdog();
  }

  /**
   * Chrome SpeechSynthesis keepalive.
   * Polls every 5 seconds; if synthesis is paused while we expect it to be
   * speaking, resume it so the queued utterances continue playing.
   * Also handles the "speaking=true but nothing audible" case by cancelling
   * and retrying the current item.
   */
  private _startChromeWatchdog() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // ── Periodic heartbeat ────────────────────────────────────────────────────
    setInterval(() => {
      // Paused while we're mid-utterance → resume
      if (this.isSpeaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Not paused, not speaking, but queue has items → something stalled
      if (!this.isSpeaking && this.narrationQueue.length > 0) {
        this._flush();
      }
    }, 5000);

    // ── Tab-visibility recovery ───────────────────────────────────────────────
    // When the browser tabs the page to the background, Chrome can collapse
    // all queued utterances (firing onend instantly), then leave the synthesis
    // engine in a broken state.  When the tab becomes visible again we do a
    // full engine reset so the next speak() call works correctly.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;

        // Force-reset any stale state that Chrome left behind
        window.speechSynthesis.cancel();
        this.isSpeaking = false;

        // If the queue still has items (was mid-narration when hidden), restart
        if (this.narrationQueue.length > 0) {
          setTimeout(() => this._flush(), 300);
        }

        // If the queue is empty but we're stuck in "speaking" → release lock
        if (!this.narrationQueue.length) {
          this.speakLockCallback?.(false);
          this.onSpeakingChange?.(false);
        }
      });
    }
  }

  /**
   * Switch the narrator gender, re-resolve the voice, and persist to localStorage.
   * The confirmation TTS is handled by the caller (GameScreen / voice command).
   */
  setVoiceGender(gender: "female" | "male") {
    this.voiceGender = gender;
    this.pitch = gender === "male" ? 0.9 : 1.2;
    try { localStorage.setItem(VOICE_GENDER_KEY, gender); } catch { /* ok */ }

    // Re-resolve voice immediately if voices are loaded
    if ("speechSynthesis" in window) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.selectedVoice = this.getPreferredVoice(voices);
      }
    }
    console.log(`[AudioManager] Voice gender → ${gender}`, this.selectedVoice?.name ?? "default");
  }

  getVoiceGender(): "female" | "male" {
    return this.voiceGender;
  }

  /**
   * Select the best available voice matching the current gender preference.
   * Falls back gracefully if no gender-specific voice is available.
   */
  getPreferredVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (voices.length === 0) return null;

    const gender       = this.voiceGender;
    const preferredNames = gender === "male" ? MALE_VOICE_NAMES : FEMALE_VOICE_NAMES;
    const genderWord   = gender;

    // 1. Exact name matches in priority order
    for (const name of preferredNames) {
      const match = voices.find(v => v.name === name);
      if (match) return match;
    }

    // 2. Any voice whose name contains the gender keyword
    const byName = voices.find(v => v.name.toLowerCase().includes(genderWord));
    if (byName) return byName;

    // 3. Partial match on preferred names
    for (const name of preferredNames) {
      const partial = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (partial) return partial;
    }

    // 4. Prefer en-GB or en-US English as neutral fallback
    const englishVoice = voices.find(v => /^en[-_](GB|US)/i.test(v.lang));
    if (englishVoice) {
      console.warn(`[AudioManager] No ${gender} voice found. Using:`, englishVoice.name);
      return englishVoice;
    }

    // 5. Absolute fallback
    console.warn("[AudioManager] No English voice found. Using first available:", voices[0]!.name);
    return voices[0] ?? null;
  }

  /** Returns the currently selected voice name, or null if not yet loaded. */
  getSelectedVoiceName(): string | null {
    return this.selectedVoice?.name ?? null;
  }

  // ── Public narration API ────────────────────────────────────────────────────

  /** Attach a listener for speaking state changes (drives the UI indicator). */
  onStateChange(cb: (speaking: boolean) => void) {
    this.onSpeakingChange = cb;
  }

  /**
   * Register the speak-lock callback used by useVoiceInput.
   * Called with `true` when TTS starts (mic should pause)
   * and `false` when TTS finishes (mic may resume).
   * Only one subscriber is supported (the voice hook).
   */
  onSpeakLock(cb: (isSpeaking: boolean) => void) {
    this.speakLockCallback = cb;
  }

  /**
   * Register a ONE-SHOT callback that fires when the narration queue fully drains.
   * The callback is cleared immediately after it fires — re-register if you need
   * it again.  Used by GameScreen to auto-start listening after the welcome
   * narration finishes without requiring any user gesture.
   */
  onQueueDrained(cb: () => void) {
    this.queueDrainedCallback = cb;
  }

  /**
   * Hard-stop all current and queued narration.
   *
   * Unlike `stop()`, this intentionally does NOT release the speak-lock or
   * fire `onSpeakingChange(false)` — the caller is expected to immediately
   * queue a new critical utterance, so the lock should remain held until
   * that utterance completes.
   *
   * Also clears `queueDrainedCallback` to prevent stale one-shot callbacks
   * from firing in the middle of the new utterance.
   */
  stopAll() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    this.utteranceSeq++;          // mark all in-flight onend/onerror events as stale
    this.narrationQueue = [];
    this.isSpeaking = false;
    this.queueDrainedCallback = undefined;
  }

  /**
   * Speak a line of text.
   *
   * Options:
   *   interrupt  — cancels the current utterance and clears the queue first.
   *   priority   — "critical" performs a hard stopAll() before speaking,
   *                then waits 80 ms (vs the normal 50 ms) to let Chrome
   *                fully process the cancel before the new utterance starts.
   *   pan        — stereo pan value (-1 left … +1 right).
   */
  speak(text: string, options: { interrupt?: boolean; priority?: "normal" | "critical"; pan?: number } = {}) {
    if (!("speechSynthesis" in window)) return;
    if (!text?.trim()) return;

    this.lastText = text;

    const isCritical = options.priority === "critical";

    if (isCritical) {
      // Hard-stop without releasing the speak-lock (new utterance is coming)
      this.stopAll();
    } else if (options.interrupt) {
      window.speechSynthesis.cancel();
      this.utteranceSeq++;    // mark any pending onend/onerror from the cancelled utterance as stale
      this.narrationQueue = [];
      this.isSpeaking = false;
    }

    this.narrationQueue.push({ text: text.trim(), pan: options.pan });

    const startSpeaking = () => {
      if (!this.voicesLoaded) {
        this._deferUntilVoicesReady();
      } else {
        this._flush();
      }
    };

    // Chrome needs time to process cancel() before a new speak() call is safe.
    // Critical utterances get 80 ms to ensure the engine fully resets.
    if (isCritical) {
      setTimeout(startSpeaking, 80);
    } else if (options.interrupt) {
      setTimeout(startSpeaking, 50);
    } else {
      startSpeaking();
    }
  }

  /** Speak multiple lines in order. Optionally interrupt current speech first. */
  speakLines(lines: string[], options: { interrupt?: boolean } = {}) {
    if (!lines.length) return;
    if (options.interrupt) {
      window.speechSynthesis.cancel();
      this.utteranceSeq++;    // mark any pending onend/onerror from the cancelled utterance as stale
      this.narrationQueue = [];
      this.isSpeaking = false;
    }
    for (const line of lines) {
      if (line.trim() && !line.startsWith(">")) {
        this.narrationQueue.push({ text: line.trim() });
      }
    }

    const startSpeaking = () => {
      if (!this.voicesLoaded) {
        this._deferUntilVoicesReady();
      } else {
        this._flush();
      }
    };

    // Give Chrome 50 ms to process cancel() before the new utterance queue starts.
    if (options.interrupt) {
      setTimeout(startSpeaking, 50);
    } else {
      startSpeaking();
    }
  }

  /**
   * Stop all narration immediately and reset all audio state.
   * Call on logout so no TTS bleeds into the auth screen.
   */
  stop() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    this.narrationQueue     = [];
    this.isSpeaking         = false;
    this.queueDrainedCallback = undefined; // prevent stale one-shot callbacks
    this.speakLockCallback?.(false);       // tell useVoiceInput speak-lock is released
    this.onSpeakingChange?.(false);
  }

  /** Repeat the last spoken text. */
  repeatLast() {
    if (this.lastText) {
      this.speak(this.lastText, { interrupt: true });
    }
  }

  /**
   * Diagnostic: speak the system test phrase.
   * Call from the browser console: AudioManager.testVoice()
   */
  testVoice() {
    const name = this.selectedVoice?.name ?? "default voice";
    console.info(`[AudioManager] Testing voice: ${name}`);
    this.speak("Voice system initialized. Welcome to Dora Dungeons.", { interrupt: true });
  }

  // ── Audio parameter controls ────────────────────────────────────────────────

  /** Set speech rate (0.5 = slow, 1.0 = normal, 2.0 = fast). Default: 0.95. */
  setSpeechRate(rate: number) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  getSpeechRate(): number {
    return this.rate;
  }

  /** Set pitch (0.5–2.0). Default: 1.2 for a clear, feminine tone. */
  setPitch(pitch: number) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  getPitch(): number {
    return this.pitch;
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  // ── Spatial / effect tones (Web Audio API) ─────────────────────────────────

  /**
   * Play a short directional tone.
   * pan: -1 = hard left, 0 = center, +1 = hard right.
   */
  playDirectionalTone(pan: number, options: { frequency?: number; duration?: number } = {}) {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + (options.duration ?? 0.18)
      );

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = options.frequency ?? 440;
      osc.frequency.exponentialRampToValueAtTime(
        (options.frequency ?? 440) * 0.7,
        ctx.currentTime + (options.duration ?? 0.18)
      );

      osc.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + (options.duration ?? 0.18));
    } catch {
      // Web Audio not available — silently continue
    }
  }

  playCombatAlert() {
    this.playDirectionalTone(0, { frequency: 220, duration: 0.12 });
    setTimeout(() => this.playDirectionalTone(0, { frequency: 180, duration: 0.1 }), 120);
  }

  playRewardChime() {
    this.playDirectionalTone(0, { frequency: 523, duration: 0.12 });
    setTimeout(() => this.playDirectionalTone(0, { frequency: 659, duration: 0.1 }), 130);
    setTimeout(() => this.playDirectionalTone(0, { frequency: 784, duration: 0.15 }), 250);
  }

  /**
   * A soft "mic hot" beep — played the instant the TTS queue drains to signal
   * to the player that the microphone is now listening.
   *
   * Two-tone sequence (880 Hz → 1108 Hz, 65 ms each) chosen to be clearly
   * audible but not jarring.  Implemented via the already-unlocked AudioContext
   * so it works reliably on iOS without requiring a new user gesture.
   */
  playListeningBeep() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      const beep = (freq: number, startOffset: number, duration: number) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.value = freq;

        const t0 = now + startOffset;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.10, t0 + 0.008); // 8 ms attack
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration);
      };

      beep(880,  0,     0.065); // A5 — first tone
      beep(1108, 0.075, 0.065); // C#6 — second tone (rising = "open")
    } catch {
      // Web Audio not available — silently continue
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** Wait for voices to be available, then flush the queue. */
  private _deferUntilVoicesReady() {
    const check = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        if (!this.selectedVoice) {
          this.selectedVoice = this.getPreferredVoice(voices);
        }
        this.voicesLoaded = true;
        this._flush();
      } else {
        // Poll until voices are ready (fallback for browsers that fire voiceschanged late)
        setTimeout(check, 100);
      }
    };
    setTimeout(check, 50);
  }

  private _flush() {
    if (this.isSpeaking || this.narrationQueue.length === 0) return;
    const next = this.narrationQueue.shift()!;
    this._speakWithSynthesis(next);
  }

  private _speakWithSynthesis(entry: QueueEntry) {
    if (!("speechSynthesis" in window)) return;

    // Stamp this utterance with a sequence number.
    // onend/onerror compare against this.utteranceSeq; if they differ the event
    // belongs to a cancelled/stale utterance and is silently ignored.
    const mySeq = ++this.utteranceSeq;

    const utterance = new SpeechSynthesisUtterance(entry.text);

    // Apply selected voice — always re-resolve in case voices changed
    const voice = this.selectedVoice ?? this._resolveVoiceNow();
    if (voice) utterance.voice = voice;

    utterance.rate   = this.rate;
    utterance.pitch  = this.pitch;
    utterance.volume = 1;
    utterance.lang   = voice?.lang ?? "en-US";

    utterance.onstart = () => {
      console.log("[AudioManager] TTS started:", entry.text.slice(0, 60));
      this.isSpeaking = true;
      // Speak-lock fires FIRST so the hook stops recognition before UI repaints
      this.speakLockCallback?.(true);
      this.onSpeakingChange?.(true);
    };

    utterance.onend = () => {
      // Drop stale events from utterances cancelled by speak({ interrupt: true }).
      // Chrome fires onend asynchronously even for cancelled utterances; without
      // this guard the callback would incorrectly release the speak-lock while
      // a fresh utterance is already running.
      if (mySeq !== this.utteranceSeq) return;

      // Reset isSpeaking so _flush() can proceed.
      this.isSpeaking = false;

      const queueNowEmpty = this.narrationQueue.length === 0;

      if (queueNowEmpty) {
        // ── Queue fully drained ─────────────────────────────────────────────
        // Only NOW release the speak-lock so the voice-input hook starts the
        // cooldown.  Releasing between sentences would cause a race where the
        // cooldown timer fires at the same moment the next utterance starts.
        console.log("[AudioManager] TTS ended");
        this.speakLockCallback?.(false);
        this.onSpeakingChange?.(false);

        // ── "Mic hot" beep ─────────────────────────────────────────────────
        // A soft A5 tone (880 Hz, 80 ms) fires the instant TTS ends so the
        // visually-impaired user knows the microphone is now listening.
        // Uses the already-unlocked AudioContext — safe on iOS.
        this.playListeningBeep();

        const cb = this.queueDrainedCallback;
        this.queueDrainedCallback = undefined; // self-clear — one-shot
        cb?.();
      } else {
        // ── More sentences queued ───────────────────────────────────────────
        // Advance the queue WITHOUT releasing the speak-lock.  This prevents
        // the cooldown timer from starting (and recognition from restarting)
        // between consecutive sentences — eliminating the race condition.
        this._flush();
      }
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      // 'interrupted' fires when we explicitly called cancel() — this is intentional
      // and does NOT mean playback failed.  The new utterance is already queued;
      // releasing the speak-lock here would incorrectly re-enable the mic early.
      const errCode = event.error as string;
      if (errCode === "interrupted" || errCode === "canceled" || errCode === "cancelled") return;

      // Also guard stale error events from old utterances.
      if (mySeq !== this.utteranceSeq) return;
      console.log("[AudioManager] TTS error —", event.error, "— releasing speak-lock");
      this.isSpeaking = false;
      this.speakLockCallback?.(false);
      this.onSpeakingChange?.(false);
      // Try to continue with whatever remains in the queue.
      this._flush();
    };

    // Chrome / Edge fix: the synthesis engine can enter a paused state
    // silently.  Calling resume() before speak() ensures it is always active.
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Synchronous fallback: try to resolve a voice right now.
   * Used when `_speakWithSynthesis` fires before `voicesLoaded` is true.
   */
  private _resolveVoiceNow(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    const resolved = this.getPreferredVoice(voices);
    this.selectedVoice = resolved;
    this.voicesLoaded = true;
    return resolved;
  }

  private _getAudioContext(): AudioContext | null {
    if (!("AudioContext" in window || "webkitAudioContext" in window)) return null;
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      // @ts-ignore webkitAudioContext for Safari
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }
}

export const AudioManager = new AudioManagerClass();
