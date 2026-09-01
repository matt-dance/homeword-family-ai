import { applyVoiceSettings, loadBestVoice, pickBestVoice, tokenizeWords } from "@/lib/speech-voice";

export interface ReadAloudState {
  messageKey: string | null;
  wordIndex: number;
  isSpeaking: boolean;
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onWordIndex?: (index: number) => void;
  onError?: (message: string) => void;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function primeSynth(synth: SpeechSynthesis) {
  if (synth.paused) synth.resume();
  synth.getVoices();
}

export function createReadAloudController() {
  let voice: SpeechSynthesisVoice | null = null;
  let utterance: SpeechSynthesisUtterance | null = null;
  let progressTimer: number | null = null;
  let unsubscribeVoice: (() => void) | undefined;

  const clearProgress = () => {
    if (progressTimer !== null) {
      window.clearInterval(progressTimer);
      progressTimer = null;
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
    clearProgress();
    utterance = null;
    const synth = getSynth();
    if (!synth) return;
    synth.cancel();
  };

  const startWordProgress = (text: string, options: SpeakOptions) => {
    const words = tokenizeWords(text);
    if (!words.length) return;

    const startedAt = Date.now();
    const msPerWord = 360;

    clearProgress();
    options.onWordIndex?.(0);

    progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const index = Math.min(words.length - 1, Math.floor(elapsed / msPerWord));
      options.onWordIndex?.(index);
    }, 80);
  };

  const speakOnce = (
    text: string,
    options: SpeakOptions,
    selectedVoice: SpeechSynthesisVoice | null,
    retried: boolean,
  ) => {
    const synth = getSynth();
    if (!synth) return;

    const next = new SpeechSynthesisUtterance(text);
    applyVoiceSettings(next, selectedVoice);
    utterance = next;

    next.onstart = () => {
      options.onStart?.();
      startWordProgress(text, options);
    };

    next.onend = () => {
      clearProgress();
      utterance = null;
      options.onEnd?.();
    };

    next.onerror = () => {
      clearProgress();
      utterance = null;
      if (!retried) {
        speakOnce(text, options, null, true);
        return;
      }
      options.onError?.("Could not read aloud. Try clicking Listen again.");
      options.onEnd?.();
    };

    primeSynth(synth);
    window.setTimeout(() => {
      if (synth.speaking || synth.pending) synth.cancel();
      window.setTimeout(() => synth.speak(next), 50);
    }, 50);
  };

  const speak = (text: string, options: SpeakOptions = {}) => {
    const trimmed = text.trim();
    const synth = getSynth();
    if (!synth || !trimmed) return false;

    ensureVoice();
    stop();
    primeSynth(synth);

    const voices = synth.getVoices();
    if (!voice && voices.length) {
      voice = pickBestVoice(voices);
    }

    if (!voices.length) {
      let started = false;
      const onVoices = () => {
        if (started) return;
        started = true;
        voice = pickBestVoice(synth.getVoices());
        speakOnce(trimmed, options, voice, false);
      };
      synth.addEventListener("voiceschanged", onVoices, { once: true });
      window.setTimeout(onVoices, 250);
      return true;
    }

    speakOnce(trimmed, options, voice, false);
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

export function splitTextForHighlight(text: string): Array<{ text: string; start: number; wordIndex: number | null }> {
  const parts: Array<{ text: string; start: number; wordIndex: number | null }> = [];
  const regex = /\S+|\s+/g;
  let wordIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const highlightable = /\S/.test(match[0]);
    parts.push({
      text: match[0],
      start: match.index,
      wordIndex: highlightable ? wordIndex++ : null,
    });
  }
  return parts;
}
