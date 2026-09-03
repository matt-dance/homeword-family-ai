import { describe, expect, it } from "vitest";
import { REPLY_CHIPS, shouldShowReplyChips } from "./reply-chips";

describe("reply chips", () => {
  it("has the three kid follow-up taps", () => {
    expect(REPLY_CHIPS.map((chip) => chip.label)).toEqual([
      "Say that simpler",
      "Tell me more",
      "Quiz me on that",
    ]);
    expect(REPLY_CHIPS.find((chip) => chip.id === "quiz")?.message).toMatch(/quiz/i);
  });

  it("hides while streaming or on blocked messages", () => {
    expect(shouldShowReplyChips({ streaming: false, blocked: false, isLastAssistant: true })).toBe(true);
    expect(shouldShowReplyChips({ streaming: true, blocked: false, isLastAssistant: true })).toBe(false);
    expect(shouldShowReplyChips({ streaming: false, blocked: true, isLastAssistant: true })).toBe(false);
    expect(shouldShowReplyChips({ streaming: false, blocked: false, isLastAssistant: false })).toBe(false);
  });
});
