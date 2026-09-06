import { describe, expect, it } from "vitest";
import {
  conversationMicLabel,
  conversationModeAvailable,
  conversationToggleLabel,
} from "./conversation-mode";

describe("conversation mode UI helpers", () => {
  it("requires both mic transcription and read-aloud", () => {
    expect(
      conversationModeAvailable({ voiceSupported: true, readAloudSupported: true }),
    ).toBe(true);
    expect(
      conversationModeAvailable({ voiceSupported: true, readAloudSupported: false }),
    ).toBe(false);
    expect(
      conversationModeAvailable({ voiceSupported: false, readAloudSupported: true }),
    ).toBe(false);
  });

  it("labels the opt-in toggle", () => {
    expect(conversationToggleLabel(false)).toBe("Talk together");
    expect(conversationToggleLabel(true)).toBe("Stop conversation");
  });

  it("uses barge-in copy on the mic while conversation TTS is playing", () => {
    expect(
      conversationMicLabel({
        conversationActive: true,
        speaking: true,
        listening: false,
      }),
    ).toBe("Interrupt and talk");
    expect(
      conversationMicLabel({
        conversationActive: false,
        speaking: true,
        listening: false,
      }),
    ).toBe("Speak with microphone");
    expect(
      conversationMicLabel({
        conversationActive: false,
        speaking: false,
        listening: true,
      }),
    ).toBe("Stop voice listening");
  });
});
