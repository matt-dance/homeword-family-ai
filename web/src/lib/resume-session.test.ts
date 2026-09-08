import { afterEach, describe, expect, it } from "vitest";
import {
  actionAfterPinUnlock,
  isResumableSession,
  preferCanonicalLastChat,
  readRememberedLastChat,
  resumeTranscript,
  shouldOfferResume,
  snapshotLastChat,
  writeRememberedLastChat,
} from "./resume-session";

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

describe("actionAfterPinUnlock", () => {
  it("resumes immediately when Continue last chat already chose a session", () => {
    expect(
      actionAfterPinUnlock({ pendingChoice: "continue", allowResume: true, quickChat: false }),
    ).toBe("resume");
  });

  it("starts fresh when that was the in-progress choice", () => {
    expect(
      actionAfterPinUnlock({ pendingChoice: "fresh", allowResume: true, quickChat: false }),
    ).toBe("fresh");
  });

  it("offers resume after a first PIN unlock on a named profile", () => {
    expect(
      actionAfterPinUnlock({ pendingChoice: null, allowResume: true, quickChat: false }),
    ).toBe("offer");
  });

  it("does not offer named resume for Quick Chat or when the parent disabled it", () => {
    expect(
      actionAfterPinUnlock({ pendingChoice: null, allowResume: true, quickChat: true }),
    ).toBe("fresh");
    expect(
      actionAfterPinUnlock({ pendingChoice: null, allowResume: false, quickChat: false }),
    ).toBe("fresh");
  });
});

describe("resumeTranscript", () => {
  it("keeps user and assistant turns with content", () => {
    expect(
      resumeTranscript({
        session_id: 9,
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "system", content: "ignore" },
          { role: "user", content: "  " },
        ],
      }),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});

describe("snapshotLastChat", () => {
  it("keeps a session only when it has content to resume", () => {
    expect(snapshotLastChat(4, [{ role: "user", content: "remember the purple dragon" }])).toEqual({
      session_id: 4,
      messages: [{ role: "user", content: "remember the purple dragon" }],
    });
    expect(snapshotLastChat(4, [])).toBeNull();
    expect(snapshotLastChat(null, [{ role: "user", content: "hi" }])).toBeNull();
  });
});

describe("preferCanonicalLastChat", () => {
  const older = {
    session_id: 2,
    messages: [{ role: "user", content: "Tell me a very short joke." }],
  };
  const fresh = {
    session_id: 5,
    messages: [{ role: "user", content: "remember the purple dragon" }],
  };

  it("prefers a Start-fresh session over an older resume GET", () => {
    expect(preferCanonicalLastChat(older, fresh)).toEqual(fresh);
  });

  it("keeps the live transcript when the session id matches", () => {
    const live = {
      session_id: 5,
      messages: [
        { role: "user", content: "remember the purple dragon" },
        { role: "assistant", content: "Got it!" },
      ],
    };
    expect(preferCanonicalLastChat(fresh, live)).toEqual(live);
  });

  it("falls back to the fetched session when nothing is remembered", () => {
    expect(preferCanonicalLastChat(older, null)).toEqual(older);
    expect(preferCanonicalLastChat(null, fresh)).toEqual(fresh);
    expect(preferCanonicalLastChat(null, { session_id: 1, messages: [] })).toBeNull();
  });
});

describe("remembered last chat storage", () => {
  const memory = new Map<string, string>();

  afterEach(() => {
    memory.clear();
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  function installMemoryStorage() {
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    };
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: storage,
    });
  }

  it("remembers a Start-fresh transcript for the same kid", () => {
    installMemoryStorage();
    const session = {
      session_id: 8,
      messages: [{ role: "user" as const, content: "remember the purple dragon" }],
    };
    writeRememberedLastChat(3, session);
    expect(readRememberedLastChat(3)).toEqual(session);
    expect(readRememberedLastChat(4)).toBeNull();
  });
});
