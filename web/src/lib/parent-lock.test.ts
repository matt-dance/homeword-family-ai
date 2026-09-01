import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  PARENT_UNLOCK_KEY,
  isParentLockExpired,
  markParentUnlocked,
  clearParentUnlock,
  subscribeParentLock,
  PARENT_LOCK_IDLE_MS,
} from "./parent-lock";

describe("parent-lock", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("starts locked when no unlock timestamp exists", () => {
    expect(isParentLockExpired()).toBe(true);
  });

  it("stays unlocked within idle window", () => {
    markParentUnlocked();
    expect(isParentLockExpired()).toBe(false);
  });

  it("locks after idle window", () => {
    vi.useFakeTimers();
    markParentUnlocked();
    vi.advanceTimersByTime(PARENT_LOCK_IDLE_MS + 1);
    expect(isParentLockExpired()).toBe(true);
  });

  it("clearParentUnlock removes stored timestamp", () => {
    markParentUnlocked();
    clearParentUnlock();
    expect(sessionStorage.getItem(PARENT_UNLOCK_KEY)).toBeNull();
  });

  it("notifies subscribers when unlock state changes", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeParentLock(() => {
      seen.push(isParentLockExpired());
    });

    markParentUnlocked();
    clearParentUnlock();
    unsubscribe();
    markParentUnlocked();

    expect(seen).toEqual([false, true]);
  });
});
