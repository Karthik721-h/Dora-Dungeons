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

/** Priority-ordered list of preferred voice names (case-sensitive exact match first). */
const PREFERRED_VOICE_NAMES: string[] = [
  "Google UK English Female",
  "Google US English",
  "Samantha",
  "Microsoft Zira Desktop",
  "Microsoft Zira",
];

class AudioManagerClass {
  // ── Narration ──────────────────────────────────────────────────────────────
  private narrationQueue: QueueEntry[] = [];
  private isSpeaking = false;
  private lastText = "";

  // ── Voice ──────────────────────────────────────────────────────────────────
  /** The resolved preferred voice (null until voices load). */
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;

  // ── Audio parameters (user-adjustable) ────────────────────────────────────
  /**
   * Base rate for clarity. 0.95 keeps speech natural without rushing.
   * The user's ± controls adjust this value (0.5–2.0 clamp).
   */
  private rate = 0.95;
  /**
   * Base pitch: 1.2 gives a clear, slightly feminine tone.
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
  }

  /**
   * Select the best available female voice from the provided list.
   * Logs a console.warn if no known female voice is found.
   */
  getPreferredVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (voices.length === 0) return null;

    // 1. Exact name matches in priority order
    for (const name of PREFERRED_VOICE_NAMES) {
      const match = voices.find(v => v.name === name);
      if (match) return match;
    }

    // 2. Any voice with "Female" or "Woman" in the name (case-insensitive)
    const femaleByName = voices.find(v =>
      /female|woman/i.test(v.name)
    );
    if (femaleByName) return femaleByName;

    // 3. Partial match on priority names (e.g. "Google UK English Female - en-GB")
    for (const name of PREFERRED_VOICE_NAMES) {
      const partial = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (partial) return partial;
    }

    // 4. Prefer en-GB or en-US over other locales
    const englishVoice = voices.find(v => /^en[-_](GB|US)/i.test(v.lang));
    if (englishVoice) {
      console.warn("[AudioManager] No known female voice found. Using:", englishVoice.name);
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

  /** Speak a line of text. interrupt=true cancels current speech immediately. */
  speak(text: string, options: { interrupt?: boolean; pan?: number } = {}) {
    if (!("speechSynthesis" in window)) return;
    if (!text?.trim()) return;

    this.lastText = text;

    if (options.interrupt) {
      window.speechSynthesis.cancel();
      this.narrationQueue = [];
      this.isSpeaking = false;
    }

    this.narrationQueue.push({ text: text.trim(), pan: options.pan });

    // If voices haven't loaded yet, defer until they do
    if (!this.voicesLoaded) {
      this._deferUntilVoicesReady();
    } else {
      this._flush();
    }
  }

  /** Speak multiple lines in order. Optionally interrupt current speech first. */
  speakLines(lines: string[], options: { interrupt?: boolean } = {}) {
    if (!lines.length) return;
    if (options.interrupt) {
      window.speechSynthesis.cancel();
      this.narrationQueue = [];
      this.isSpeaking = false;
    }
    for (const line of lines) {
      if (line.trim() && !line.startsWith(">")) {
        this.narrationQueue.push({ text: line.trim() });
      }
    }
    if (!this.voicesLoaded) {
      this._deferUntilVoicesReady();
    } else {
      this._flush();
    }
  }

  /** Stop all narration immediately. */
  stop() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    this.narrationQueue = [];
    this.isSpeaking = false;
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
      console.log("[AudioManager] TTS ended");
      this.isSpeaking = false;
      this.speakLockCallback?.(false);
      this.onSpeakingChange?.(false);
      this._flush();
    };

    utterance.onerror = () => {
      console.log("[AudioManager] TTS error — releasing speak-lock");
      this.isSpeaking = false;
      this.speakLockCallback?.(false);
      this.onSpeakingChange?.(false);
      this._flush();
    };

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
