import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createReadAloudController,
  splitTextForHighlight,
  wordIndexAtTime,
  wordIndexFromProgress,
} from "@/lib/read-aloud";
import { sanitizeForSpeech } from "@/lib/speech-voice";

const sampleWords = [
  { word: "Rock", start: 0.0, end: 0.4 },
  { word: "and", start: 0.4, end: 0.55 },
  { word: "roll", start: 0.55, end: 0.9 },
];

describe("wordIndexAtTime", () => {
  it("returns the word being spoken at each timestamp", () => {
    expect(wordIndexAtTime(sampleWords, 0.0)).toBe(0);
    expect(wordIndexAtTime(sampleWords, 0.41)).toBe(1);
    expect(wordIndexAtTime(sampleWords, 0.7)).toBe(2);
    expect(wordIndexAtTime(sampleWords, 0.95)).toBe(2);
  });
});

describe("wordIndexFromProgress", () => {
  it("maps playback progress to word index as fallback", () => {
    expect(wordIndexFromProgress(10, 0, 10)).toBe(0);
    expect(wordIndexFromProgress(10, 5, 10)).toBe(5);
  });
});

describe("createReadAloudController", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation(() => ({
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        currentTime: 0,
        duration: 1,
        onplay: null,
        onended: null,
        onerror: null,
        ontimeupdate: null,
      })),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses server word timings during playback", async () => {
    const fetchSpeechPayload = vi.fn().mockResolvedValue({
      audio: new Blob(["RIFF"], { type: "audio/wav" }),
      words: sampleWords,
      duration: 0.9,
    });
    const controller = createReadAloudController(fetchSpeechPayload);
    const onWordIndex = vi.fn();

    await controller.speak("Rock and roll", { onWordIndex });
    const audio = (Audio as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;

    audio.currentTime = 0.5;
    audio.ontimeupdate?.();
    expect(onWordIndex).toHaveBeenCalledWith(1);
  });
});

describe("splitTextForHighlight", () => {
  it("assigns word indexes to tokens", () => {
    const parts = splitTextForHighlight("Hello world");
    expect(parts.filter((p) => p.wordIndex !== null).map((p) => p.text)).toEqual(["Hello", "world"]);
  });
});

describe("sanitizeForSpeech", () => {
  it("strips emoji that break TTS", () => {
    expect(sanitizeForSpeech("Rock and roll 🤘 yeah")).toBe("Rock and roll yeah");
  });
});
