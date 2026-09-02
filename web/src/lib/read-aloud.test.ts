import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createReadAloudController } from "@/lib/read-aloud";
import { sanitizeForSpeech } from "@/lib/speech-voice";

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
    const fetchSpeechPayload = vi.fn().mockResolvedValue({
      audio: new Blob(["RIFF"], { type: "audio/wav" }),
      duration: 1,
    });
    const controller = createReadAloudController(fetchSpeechPayload);
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const started = await controller.speak("Hello stars", { onStart, onEnd });
    expect(started).toBe(true);
    expect(fetchSpeechPayload).toHaveBeenCalledWith("Hello stars");

    const audio = (Audio as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    audio.onplay?.();
    expect(onStart).toHaveBeenCalled();

    audio.onended?.();
    expect(onEnd).toHaveBeenCalled();
  });

  it("reports errors when fetch fails", async () => {
    const fetchSpeechPayload = vi.fn().mockRejectedValue(new Error("network down"));
    const controller = createReadAloudController(fetchSpeechPayload);
    const onError = vi.fn();
    const onEnd = vi.fn();

    const started = await controller.speak("Hello", { onError, onEnd });
    expect(started).toBe(false);
    expect(onError).toHaveBeenCalledWith("network down");
    expect(onEnd).toHaveBeenCalled();
  });

  it("rejects emoji-only text", async () => {
    const fetchSpeechPayload = vi.fn();
    const controller = createReadAloudController(fetchSpeechPayload);
    const onError = vi.fn();

    await controller.speak("🤘", { onError });
    expect(fetchSpeechPayload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Nothing to read aloud.");
  });
});

describe("sanitizeForSpeech", () => {
  it("strips emoji that break TTS", () => {
    expect(sanitizeForSpeech("Rock and roll 🤘 yeah")).toBe("Rock and roll yeah");
  });

  it("strips markdown for read-aloud", () => {
    expect(sanitizeForSpeech("## Dogs\nThey are **loyal**.")).toBe("Dogs They are loyal.");
  });
});
