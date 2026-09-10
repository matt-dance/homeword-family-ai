import { describe, expect, it, vi } from "vitest";
import { LLM_UNAVAILABLE_MESSAGE } from "./nonstream-chat-error";
import {
  isAbortLikeError,
  kidSafeUnhandledStreamMessage,
  kidText,
  reportKidChatStreamFailure,
  STREAM_STALL_MESSAGE,
} from "./kid-chat-stream-error";

describe("isAbortLikeError", () => {
  it("treats string abort reasons as abort-like", () => {
    expect(isAbortLikeError("idle-timeout")).toBe(true);
    expect(isAbortLikeError("total-timeout")).toBe(true);
  });

  it("treats TypeError terminated as abort-like", () => {
    expect(isAbortLikeError(new TypeError("terminated"))).toBe(true);
    expect(isAbortLikeError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
  });

  it("does not treat PIN errors as abort-like", () => {
    expect(isAbortLikeError(new Error("PIN required"))).toBe(false);
  });
});

describe("kidSafeUnhandledStreamMessage", () => {
  it("maps idle-timeout strings to the nap copy, never the raw reason", () => {
    expect(kidSafeUnhandledStreamMessage("idle-timeout")).toBe(STREAM_STALL_MESSAGE);
    expect(kidSafeUnhandledStreamMessage("idle-timeout")).toMatch(/nap|try again/i);
    expect(kidSafeUnhandledStreamMessage("idle-timeout").toLowerCase()).not.toContain("idle-timeout");
  });

  it("maps TypeError terminated to nap copy", () => {
    expect(kidSafeUnhandledStreamMessage(new TypeError("terminated"))).toBe(LLM_UNAVAILABLE_MESSAGE);
  });

  it("keeps useful gateway copy", () => {
    expect(kidSafeUnhandledStreamMessage(new Error("PIN required"))).toBe("PIN required");
  });
});

describe("kidText", () => {
  it("rejects non-strings so React never sees an object child", () => {
    expect(kidText({ message: "nope" })).toBe(STREAM_STALL_MESSAGE);
    expect(kidText(undefined)).toBe(STREAM_STALL_MESSAGE);
    expect(kidText("Hello")).toBe("Hello");
  });
});

describe("reportKidChatStreamFailure", () => {
  it("always logs a stack for string throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportKidChatStreamFailure("idle-timeout", "test-context");
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0].map(String).join(" ");
    expect(args).toMatch(/kid-chat stream failure/);
    expect(args).toMatch(/test-context/);
    expect(args).toMatch(/idle-timeout/);
    spy.mockRestore();
  });
});
