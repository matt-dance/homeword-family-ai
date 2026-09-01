import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createReadAloudController,
  splitTextForHighlight,
  wordIndexFromProgress,
} from "@/lib/read-aloud";
import { sanitizeForSpeech } from "@/lib/speech-voice";

describe("sanitizeForSpeech", () => {
  it("strips emoji that break TTS", () => {
    expect(sanitizeForSpeech("Rock and roll 🤘 yeah")).toBe("Rock and roll yeah");
  });

  it("returns empty for emoji-only input", () => {
    expect(sanitizeForSpeech("🤘✨")).toBe("");
  });
});

describe("wordIndexFromProgress", () => {
  it("maps playback progress to word index", () => {
    expect(wordIndexFromProgress(10, 0, 10)).toBe(0);
    expect(wordIndexFromProgress(10, 5, 10)).toBe(5);
    expect(wordIndexFromProgress(10, 10, 10)).toBe(9);
  });
});

describe("splitTextForHighlight", () => {
  it("assigns word indexes to tokens", () => {
    const parts = splitTextForHighlight("Hello world");
    expect(parts.filter((p) => p.wordIndex !== null).map((p) => p.text)).toEqual(["Hello", "world"]);
  });
});

describe("createReadAloudController", () => {
  beforeEach(() => {
    vi.stubGlobal("setInterval", (fn: () => void) => {
      fn();
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.stubGlobal("clearInterval", vi.fn());
    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation(() => ({
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        currentTime: 0,
        duration: 4,
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

  it("fetches audio and starts playback", async () => {
    const fetchSpeechAudio = vi.fn().mockResolvedValue(new Blob(["RIFF"], { type: "audio/wav" }));
    const controller = createReadAloudController(fetchSpeechAudio);
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const started = await controller.speak("Hello stars", { onStart, onEnd });
    expect(started).toBe(true);
    expect(fetchSpeechAudio).toHaveBeenCalledWith("Hello stars");

    const audio = (Audio as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    audio.onplay?.();
    expect(onStart).toHaveBeenCalled();

    audio.onended?.();
    expect(onEnd).toHaveBeenCalled();
  });

  it("reports errors when fetch fails", async () => {
    const fetchSpeechAudio = vi.fn().mockRejectedValue(new Error("network down"));
    const controller = createReadAloudController(fetchSpeechAudio);
    const onError = vi.fn();
    const onEnd = vi.fn();

    const started = await controller.speak("Hello", { onError, onEnd });
    expect(started).toBe(false);
    expect(onError).toHaveBeenCalledWith("network down");
    expect(onEnd).toHaveBeenCalled();
  });

  it("rejects emoji-only text", async () => {
    const fetchSpeechAudio = vi.fn();
    const controller = createReadAloudController(fetchSpeechAudio);
    const onError = vi.fn();

    await controller.speak("🤘", { onError });
    expect(fetchSpeechAudio).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Nothing to read aloud.");
  });
});
