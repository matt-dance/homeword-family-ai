import { sanitizeForSpeech, tokenizeWords } from "@/lib/speech-voice";

export interface ReadAloudState {
  messageKey: string | null;
  wordIndex: number;
  isSpeaking: boolean;
  isLoading: boolean;
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onWordIndex?: (index: number) => void;
  onError?: (message: string) => void;
}

export type FetchSpeechAudio = (text: string) => Promise<Blob>;

export function wordIndexFromProgress(wordCount: number, currentTime: number, duration: number): number {
  if (!wordCount || !duration || duration <= 0) return 0;
  const progress = Math.min(1, Math.max(0, currentTime / duration));
  return Math.min(wordCount - 1, Math.floor(progress * wordCount));
}

export function createReadAloudController(fetchSpeechAudio: FetchSpeechAudio) {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let progressTimer: number | null = null;
  let activeWords: string[] = [];

  const clearProgress = () => {
    if (progressTimer !== null) {
      globalThis.clearInterval(progressTimer);
      progressTimer = null;
    }
  };

  const revokeUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const stop = () => {
    clearProgress();
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.pause();
      audio = null;
    }
    revokeUrl();
    activeWords = [];
  };

  const trackProgress = (options: SpeakOptions) => {
    clearProgress();
    progressTimer = globalThis.setInterval(() => {
      if (!audio || !activeWords.length) return;
      const index = wordIndexFromProgress(activeWords.length, audio.currentTime, audio.duration || 0);
      options.onWordIndex?.(index);
    }, 80);
  };

  const speak = async (text: string, options: SpeakOptions = {}) => {
    const trimmed = sanitizeForSpeech(text);
    if (!trimmed) {
      options.onError?.("Nothing to read aloud.");
      options.onEnd?.();
      return false;
    }

    stop();
    activeWords = tokenizeWords(trimmed);

    try {
      const blob = await fetchSpeechAudio(trimmed);
      if (!blob.size) throw new Error("Empty audio response");

      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);

      audio.onplay = () => {
        options.onStart?.();
        options.onWordIndex?.(0);
        trackProgress(options);
      };

      audio.onended = () => {
        stop();
        options.onEnd?.();
      };

      audio.onerror = () => {
        stop();
        options.onError?.("Could not play read-aloud audio.");
        options.onEnd?.();
      };

      await audio.play();
      return true;
    } catch (error) {
      stop();
      const message =
        error instanceof Error ? error.message : "Could not read aloud. Try clicking Listen again.";
      options.onError?.(message);
      options.onEnd?.();
      return false;
    }
  };

  const dispose = () => stop();

  return { speak, stop, dispose };
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
