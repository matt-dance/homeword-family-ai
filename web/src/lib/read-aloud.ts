import { sanitizeForSpeech } from "@/lib/speech-voice";

export interface SpeechPayload {
  audio: Blob;
  duration: number;
}

export interface ReadAloudState {
  messageKey: string | null;
  isSpeaking: boolean;
  isLoading: boolean;
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export type FetchSpeechPayload = (text: string) => Promise<SpeechPayload>;

export function createReadAloudController(fetchSpeechPayload: FetchSpeechPayload) {
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;

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
      audio.pause();
      audio = null;
    }
    revokeUrl();
  };

  const speak = async (text: string, options: SpeakOptions = {}) => {
    const trimmed = sanitizeForSpeech(text);
    if (!trimmed) {
      options.onError?.("Nothing to read aloud.");
      options.onEnd?.();
      return false;
    }

    stop();

    try {
      const payload = await fetchSpeechPayload(trimmed);
      if (!payload.audio.size) throw new Error("Empty audio response");

      objectUrl = URL.createObjectURL(payload.audio);
      audio = new Audio(objectUrl);

      audio.onplay = () => options.onStart?.();

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

export function decodeSpeechPayload(data: {
  audio_base64: string;
  words?: unknown[];
  duration: number;
}): SpeechPayload {
  const binary = atob(data.audio_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return {
    audio: new Blob([bytes], { type: "audio/wav" }),
    duration: data.duration,
  };
}
