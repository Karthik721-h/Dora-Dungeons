/**
 * AudioManager
 *
 * Central audio controller for Dora Dungeons.
 * Handles all spoken narration via Web Speech Synthesis (SpeechSynthesis API)
 * and directional spatial cues via Web Audio API.
 *
 * Channels (future):
 *   - narration: spoken game text (SpeechSynthesis)
 *   - ambient: looping background sound (Web Audio, not yet implemented)
 *   - effects: short directional tones (Web Audio oscillator)
 *
 * Designed to be swapped for an external TTS provider (e.g. ElevenLabs)
 * by replacing the `_speakWithSynthesis` method while keeping the public API.
 */

export type AudioChannel = "narration" | "ambient" | "effects";

interface QueueEntry {
  text: string;
  pan?: number;
  priority?: "normal" | "interrupt";
}

class AudioManagerClass {
  private narrationQueue: QueueEntry[] = [];
  private isSpeaking = false;
  private rate = 1.0;
  private pitch = 1.0;
  private lastText = "";
  private audioCtx: AudioContext | null = null;
  private onSpeakingChange?: (speaking: boolean) => void;

  /** Attach a listener for speaking state changes (used to update UI). */
  onStateChange(cb: (speaking: boolean) => void) {
    this.onSpeakingChange = cb;
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
    this._flush();
  }

  /** Speak multiple lines, queued in order. Optionally interrupt current speech first. */
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
    this._flush();
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

  /** Set speech rate (0.5 = slow, 1.0 = normal, 2.0 = fast). */
  setSpeechRate(rate: number) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  getSpeechRate() {
    return this.rate;
  }

  setPitch(pitch: number) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  getIsSpeaking() {
    return this.isSpeaking;
  }

  /**
   * Play a short directional tone using the Web Audio API.
   * pan: -1 = hard left, 0 = center, +1 = hard right
   * Used as a spatial cue before moving/interacting in a direction.
   */
  playDirectionalTone(pan: number, options: { frequency?: number; duration?: number } = {}) {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (options.duration ?? 0.18));

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

  /**
   * Play a combat alert tone (brief discordant pulse).
   */
  playCombatAlert() {
    this.playDirectionalTone(0, { frequency: 220, duration: 0.12 });
    setTimeout(() => this.playDirectionalTone(0, { frequency: 180, duration: 0.1 }), 120);
  }

  /**
   * Play a success/reward chime.
   */
  playRewardChime() {
    this.playDirectionalTone(0, { frequency: 523, duration: 0.12 });
    setTimeout(() => this.playDirectionalTone(0, { frequency: 659, duration: 0.1 }), 130);
    setTimeout(() => this.playDirectionalTone(0, { frequency: 784, duration: 0.15 }), 250);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _flush() {
    if (this.isSpeaking || this.narrationQueue.length === 0) return;
    const next = this.narrationQueue.shift()!;
    this._speakWithSynthesis(next);
  }

  private _speakWithSynthesis(entry: QueueEntry) {
    if (!("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(entry.text);
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = 1;
    utterance.lang = "en-US";

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.onSpeakingChange?.(true);
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.onSpeakingChange?.(false);
      this._flush();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.onSpeakingChange?.(false);
      this._flush();
    };

    window.speechSynthesis.speak(utterance);
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
