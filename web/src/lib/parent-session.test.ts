import { describe, expect, it, beforeEach, vi } from "vitest";
import { PARENT_UNLOCK_KEY } from "./parent-lock";
import {
  PARENT_SIGNED_OUT_KEY,
  applyAuthMeResult,
  clearParentSignedOut,
  isParentSignedOut,
  markParentSignedOut,
  parentDashboardShouldRender,
  parentRouteAfterSessionCheck,
  signOutParentSession,
} from "./parent-session";

describe("parent-session", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
    clearParentSignedOut();
    vi.useRealTimers();
  });

  it("starts allowed to restore until sign-out", () => {
    expect(isParentSignedOut()).toBe(false);
  });

  it("clears idle-unlock storage on sign-out", () => {
    sessionStorage.setItem(PARENT_UNLOCK_KEY, String(Date.now()));
    markParentSignedOut();
    expect(sessionStorage.getItem(PARENT_UNLOCK_KEY)).toBeNull();
    expect(sessionStorage.getItem(PARENT_SIGNED_OUT_KEY)).toBe("1");
  });

  it("blocks dashboard restore after sign-out even if auth/me would succeed", () => {
    markParentSignedOut();
    expect(isParentSignedOut()).toBe(true);
    expect(
      applyAuthMeResult({ signedOut: isParentSignedOut(), meOk: true }),
    ).toBe("unauthed");
    expect(
      parentRouteAfterSessionCheck({
        setupComplete: true,
        hasParent: true,
        signedOut: true,
        meOk: true,
      }),
    ).toBe("/setup");
  });

  it("keeps the unauthenticated gate for at least 5s after sign-out", () => {
    vi.useFakeTimers();
    markParentSignedOut();
    vi.advanceTimersByTime(5_000);
    expect(isParentSignedOut()).toBe(true);
    expect(parentDashboardShouldRender("unauthed")).toBe(false);
    expect(
      parentRouteAfterSessionCheck({
        setupComplete: true,
        hasParent: true,
        signedOut: isParentSignedOut(),
        meOk: true,
      }),
    ).toBe("/setup");
  });

  it("does not render dashboard children until auth/me succeeds", () => {
    expect(parentDashboardShouldRender("checking")).toBe(false);
    expect(parentDashboardShouldRender("unauthed")).toBe(false);
    expect(parentDashboardShouldRender("authed")).toBe(true);
    expect(applyAuthMeResult({ signedOut: false, meOk: false })).toBe("unauthed");
    expect(applyAuthMeResult({ signedOut: false, meOk: true })).toBe("authed");
    expect(applyAuthMeResult({ signedOut: false, meOk: true, cancelled: true })).toBe(
      "unauthed",
    );
  });

  it("sends / and /dashboard to login until a real password sign-in", () => {
    expect(
      parentRouteAfterSessionCheck({
        setupComplete: true,
        hasParent: true,
        signedOut: false,
        meOk: false,
      }),
    ).toBe("/setup");
    expect(
      parentRouteAfterSessionCheck({
        setupComplete: true,
        hasParent: true,
        signedOut: false,
        meOk: true,
      }),
    ).toBe("/dashboard");
  });

  it("does not send incomplete setup to the dashboard", () => {
    expect(
      parentRouteAfterSessionCheck({
        setupComplete: false,
        hasParent: true,
        signedOut: false,
        meOk: true,
      }),
    ).toBe("/setup");
  });

  it("marks signed out before logout so a stale me cannot restore", async () => {
    let signedOutDuringLogout = false;
    const logout = async () => {
      signedOutDuringLogout = isParentSignedOut();
    };
    let navigated = false;
    await signOutParentSession(logout, () => {
      navigated = true;
    });
    expect(signedOutDuringLogout).toBe(true);
    expect(navigated).toBe(true);
    expect(isParentSignedOut()).toBe(true);
  });

  it("still leaves the dashboard when API logout fails", async () => {
    let navigated = false;
    await signOutParentSession(
      async () => {
        throw new Error("network");
      },
      () => {
        navigated = true;
      },
    );
    expect(navigated).toBe(true);
    expect(isParentSignedOut()).toBe(true);
  });

  it("allows restore only after sign-out is cleared by a real login", () => {
    markParentSignedOut();
    expect(isParentSignedOut()).toBe(true);
    clearParentSignedOut();
    expect(isParentSignedOut()).toBe(false);
    expect(
      parentRouteAfterSessionCheck({
        setupComplete: true,
        hasParent: true,
        signedOut: false,
        meOk: true,
      }),
    ).toBe("/dashboard");
  });
});
