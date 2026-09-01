import { applyVoiceSettings, loadBestVoice, pickBestVoice } from "@/lib/speech-voice";

export interface ReadAloudState {
  messageKey: string | null;
  charIndex: number;
  isSpeaking: boolean;
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: (charIndex: number) => void;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

/** Chrome sometimes drops speak() unless synthesis is resumed after a user gesture. */
function primeSynth(synth: SpeechSynthesis) {
  if (synth.paused) synth.resume();
  synth.getVoices();
}

export function createReadAloudController() {
  let voice: SpeechSynthesisVoice | null = null;
  let utterance: SpeechSynthesisUtterance | null = null;
  let fallbackTimer: number | null = null;
  let unsubscribeVoice: (() => void) | undefined;

  const clearFallback = () => {
    if (fallbackTimer !== null) {
      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const ensureVoice = () => {
    if (typeof window === "undefined") return;
    if (!unsubscribeVoice) {
      unsubscribeVoice = loadBestVoice((loaded) => {
        voice = loaded;
      });
    }
    if (!voice) {
      voice = pickBestVoice(window.speechSynthesis.getVoices());
    }
  };

  const stop = () => {
    const synth = getSynth();
    clearFallback();
    utterance = null;
    if (!synth) return;
    synth.cancel();
  };

  const speak = (text: string, options: SpeakOptions = {}) => {
    const trimmed = text.trim();
    const synth = getSynth();
    if (!synth || !trimmed) return false;

    ensureVoice();
    stop();
    primeSynth(synth);

    const next = new SpeechSynthesisUtterance(trimmed);
    applyVoiceSettings(next, voice);
    utterance = next;

    next.onboundary = (event) => {
      if (event.charIndex >= 0) {
        clearFallback();
        options.onBoundary?.(event.charIndex);
      }
    };

    next.onstart = () => {
      options.onStart?.();
      const fallbackStart = Date.now();
      const estimatedMs = Math.max(1500, trimmed.split(/\s+/).length * 340);
      clearFallback();
      fallbackTimer = window.setInterval(() => {
        const progress = Math.min(1, (Date.now() - fallbackStart) / estimatedMs);
        options.onBoundary?.(Math.floor(trimmed.length * progress));
      }, 80);
    };

    const finish = () => {
      clearFallback();
      utterance = null;
      options.onEnd?.();
    };

    next.onend = finish;
    next.onerror = finish;

    const start = () => {
      primeSynth(synth);
      synth.speak(next);
    };

    if (synth.getVoices().length === 0) {
      synth.addEventListener(
        "voiceschanged",
        () => {
          voice = pickBestVoice(synth.getVoices());
          if (voice) next.voice = voice;
          start();
        },
        { once: true },
      );
      window.setTimeout(start, 120);
    } else {
      start();
    }

    return true;
  };

  const dispose = () => {
    stop();
    unsubscribeVoice?.();
    unsubscribeVoice = undefined;
  };

  return { speak, stop, dispose };
}

export function primeReadAloudFromGesture(): void {
  const synth = getSynth();
  if (!synth) return;
  primeSynth(synth);
}

export function isReadAloudSupported(): boolean {
  return typeof window !== "undefined" && Boolean(window.speechSynthesis);
}

/** Split visible text into word spans for follow-along highlighting. */
export function splitTextForHighlight(text: string): Array<{ text: string; start: number; highlightable: boolean }> {
  const parts: Array<{ text: string; start: number; highlightable: boolean }> = [];
  const regex = /\S+|\s+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    parts.push({
      text: match[0],
      start: match.index,
      highlightable: /\S/.test(match[0]),
    });
  }
  return parts;
}

export function activeWordStart(
  parts: Array<{ start: number; highlightable: boolean }>,
  charIndex: number,
): number | null {
  let current: number | null = null;
  for (const part of parts) {
    if (!part.highlightable) continue;
    if (charIndex >= part.start) current = part.start;
    else break;
  }
  return current;
}
