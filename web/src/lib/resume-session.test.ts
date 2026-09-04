import { describe, expect, it } from "vitest";
import { isResumableSession, shouldOfferResume } from "./resume-session";

describe("shouldOfferResume", () => {
  const session = {
    session_id: 12,
    messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
  };

  it("offers continue only for a real non-empty prior session", () => {
    expect(shouldOfferResume({ allowResume: true, quickChat: false, session })).toBe(true);
  });

  it("does not offer when there is no session", () => {
    expect(shouldOfferResume({ allowResume: true, quickChat: false, session: null })).toBe(false);
  });

  it("does not offer an empty session", () => {
    expect(
      shouldOfferResume({
        allowResume: true,
        quickChat: false,
        session: { session_id: 3, messages: [] },
      }),
    ).toBe(false);
  });

  it("does not offer for Quick Chat or when the parent disabled resume", () => {
    expect(shouldOfferResume({ allowResume: true, quickChat: true, session })).toBe(false);
    expect(shouldOfferResume({ allowResume: false, quickChat: false, session })).toBe(false);
  });
});

describe("isResumableSession", () => {
  it("requires a session id and at least one message with content", () => {
    expect(isResumableSession({ session_id: 1, messages: [{ role: "user", content: "hi" }] })).toBe(true);
    expect(isResumableSession({ session_id: 1, messages: [{ role: "user", content: "   " }] })).toBe(false);
    expect(isResumableSession({ session_id: 1, messages: [] })).toBe(false);
    expect(isResumableSession(null)).toBe(false);
  });
});
