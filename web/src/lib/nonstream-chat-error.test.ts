import { describe, expect, it } from "vitest";
import {
  kidSafeChatError,
  shouldReplaceWithKidSafeChatError,
} from "./nonstream-chat-error";

describe("non-stream chat error mapping", () => {
  it("builds the kid-safe nap payload clients already understand", () => {
    const payload = kidSafeChatError(12);
    expect(payload.blocked).toBe(true);
    expect(payload.session_id).toBe(12);
    expect(payload.message).toMatch(/nap|try again/i);
    expect(payload.message.toLowerCase()).not.toContain("internal server error");
  });

  it("replaces a bare HTTP 500 with structured JSON", () => {
    expect(shouldReplaceWithKidSafeChatError(500, { detail: "Internal Server Error" })).toBe(true);
    expect(shouldReplaceWithKidSafeChatError(502, "timeout")).toBe(true);
    expect(shouldReplaceWithKidSafeChatError(500, null)).toBe(true);
  });

  it("keeps structured LLM errors and non-500 responses", () => {
    expect(
      shouldReplaceWithKidSafeChatError(200, {
        blocked: true,
        message: "Homeward's brain is taking a nap right now.",
      }),
    ).toBe(false);
    expect(shouldReplaceWithKidSafeChatError(403, { detail: "PIN required" })).toBe(false);
    expect(shouldReplaceWithKidSafeChatError(429, { detail: "Too many requests" })).toBe(false);
  });
});
