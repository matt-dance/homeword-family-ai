import { sanitizeForSpeech, tokenizeWords } from "@/lib/speech-voice";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface SpeechPayload {
  audio: Blob;
  words: WordTiming[];
  duration: number;
}

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

export type FetchSpeechPayload = (text: string) => Promise<SpeechPayload>;

/** Find the word being spoken at a given playback time (seconds). */
export function wordIndexAtTime(words: WordTiming[], currentTime: number): number {
  if (!words.length) return 0;
  for (let i = words.length - 1; i >= 0; i--) {
    if (currentTime >= words[i].start) return i;
  }
  return 0;
}

/** Linear fallback when word timings are unavailable. */
export function wordIndexFromProgress(wordCount: number, currentTime: number, duration: number): number {
  if (!wordCount || !duration || duration <= 0) return 0;
  const progress = Math.min(1, Math.max(0, currentTime / duration));
  return Math.min(wordCount - 1, Math.floor(progress * wordCount));
}

export function resolveWordIndex(
  words: WordTiming[],
  wordCount: number,
  currentTime: number,
  duration: number,
): number {
  if (words.length) return wordIndexAtTime(words, currentTime);
  return wordIndexFromProgress(wordCount, currentTime, duration);
}

export function createReadAloudController(fetchSpeechPayload: FetchSpeechPayload) {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let wordTimings: WordTiming[] = [];
  let fallbackWordCount = 0;

  const revokeUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const stop = () => {
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.pause();
      audio = null;
    }
    revokeUrl();
    wordTimings = [];
    fallbackWordCount = 0;
  };

  const updateWordIndex = (options: SpeakOptions) => {
    if (!audio) return;
    const duration = audio.duration || 0;
    const index = resolveWordIndex(wordTimings, fallbackWordCount, audio.currentTime, duration);
    options.onWordIndex?.(index);
  };

  const speak = async (text: string, options: SpeakOptions = {}) => {
    const trimmed = sanitizeForSpeech(text);
    if (!trimmed) {
      options.onError?.("Nothing to read aloud.");
      options.onEnd?.();
      return false;
    }

    stop();
    fallbackWordCount = tokenizeWords(trimmed).length;

    try {
      const payload = await fetchSpeechPayload(trimmed);
      if (!payload.audio.size) throw new Error("Empty audio response");

      wordTimings = payload.words;
      objectUrl = URL.createObjectURL(payload.audio);
      audio = new Audio(objectUrl);

      audio.onplay = () => {
        options.onStart?.();
        options.onWordIndex?.(0);
      };

      audio.ontimeupdate = () => updateWordIndex(options);

      audio.onended = () => {
        options.onWordIndex?.(Math.max(0, (wordTimings.length || fallbackWordCount) - 1));
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

export function decodeSpeechPayload(data: {
  audio_base64: string;
  words: WordTiming[];
  duration: number;
}): SpeechPayload {
  const binary = atob(data.audio_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return {
    audio: new Blob([bytes], { type: "audio/wav" }),
    words: data.words,
    duration: data.duration,
  };
}
