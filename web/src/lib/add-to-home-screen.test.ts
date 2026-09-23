import { describe, expect, it, beforeEach, vi } from "vitest";
import { dismissAddToHomeScreen, hasDismissedAddToHomeScreen } from "./add-to-home-screen";

describe("add to home screen prompt", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
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
    });
  });

  it("is shown once until dismissed", () => {
    expect(hasDismissedAddToHomeScreen()).toBe(false);
    dismissAddToHomeScreen();
    expect(hasDismissedAddToHomeScreen()).toBe(true);
  });
});
