import { describe, expect, it } from "vitest";
import {
  lastAssistantHasText,
  shouldShowStreamThinking,
  streamComposerHint,
} from "./stream-progress";

describe("stream progress", () => {
  it("keeps thinking up after a lookup card with no reply text yet", () => {
    expect(shouldShowStreamThinking(true, { role: "user", content: "who is the qb" })).toBe(true);
    expect(shouldShowStreamThinking(true, { role: "assistant", content: "" })).toBe(true);
    expect(shouldShowStreamThinking(true, { role: "assistant", content: "   " })).toBe(true);
  });

  it("hides thinking once reply text starts", () => {
    expect(shouldShowStreamThinking(true, { role: "assistant", content: "Maddux" })).toBe(false);
    expect(shouldShowStreamThinking(false, { role: "assistant", content: "" })).toBe(false);
  });

  it("treats only non-empty assistant text as a started reply", () => {
    expect(lastAssistantHasText({ role: "assistant", content: "" })).toBe(false);
    expect(lastAssistantHasText({ role: "user", content: "hi" })).toBe(false);
    expect(lastAssistantHasText({ role: "assistant", content: "Hi" })).toBe(true);
  });

  it("explains why the composer is paused", () => {
    expect(streamComposerHint("Looking that up…")).toMatch(/Tap Stop/i);
    expect(streamComposerHint(null)).toMatch(/Still working/i);
  });
});
