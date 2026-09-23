import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearPromptAddToHomeScreenAfterJoin,
  dismissAddToHomeScreen,
  hasDismissedAddToHomeScreen,
  markPromptAddToHomeScreenAfterJoin,
  shouldPromptAddToHomeScreenAfterJoin,
} from "./add-to-home-screen";

describe("add to home screen prompt", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const session = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => {
          session.set(key, value);
        },
        removeItem: (key: string) => {
          session.delete(key);
        },
      },
    });
  });

  it("is shown once until dismissed", () => {
    expect(hasDismissedAddToHomeScreen()).toBe(false);
    dismissAddToHomeScreen();
    expect(hasDismissedAddToHomeScreen()).toBe(true);
  });

  it("prompts on /chat after join, not on the house-code URL", () => {
    expect(shouldPromptAddToHomeScreenAfterJoin()).toBe(false);
    markPromptAddToHomeScreenAfterJoin();
    expect(shouldPromptAddToHomeScreenAfterJoin()).toBe(true);
    dismissAddToHomeScreen();
    expect(shouldPromptAddToHomeScreenAfterJoin()).toBe(false);
    expect(hasDismissedAddToHomeScreen()).toBe(true);
  });

  it("can clear the after-join flag without dismissing forever", () => {
    markPromptAddToHomeScreenAfterJoin();
    clearPromptAddToHomeScreenAfterJoin();
    expect(shouldPromptAddToHomeScreenAfterJoin()).toBe(false);
    expect(hasDismissedAddToHomeScreen()).toBe(false);
  });
});
