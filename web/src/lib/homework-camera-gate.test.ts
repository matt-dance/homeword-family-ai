import { describe, expect, it, beforeEach, vi } from "vitest";
import { PARENT_UNLOCK_KEY, markParentUnlocked, clearParentUnlock } from "./parent-lock";
import {
  HOMEWORK_CAMERA_UNLOCK_KEY,
  HOMEWORK_CAMERA_UNLOCK_MS,
  clearHomeworkCameraUnlock,
  homeworkCameraCaptureAllowed,
  homeworkCameraClickAction,
  homeworkCameraIsUnlocked,
  isHomeworkCameraUnlockExpired,
  mapHomeworkParentError,
  markHomeworkCameraUnlocked,
} from "./homework-camera-gate";

describe("homeworkCameraClickAction", () => {
  it("closes without a challenge when the panel is already open", () => {
    expect(homeworkCameraClickAction(true, false)).toBe("close");
    expect(homeworkCameraClickAction(true, true)).toBe("close");
  });

  it("opens immediately only after a camera-only parent unlock", () => {
    expect(homeworkCameraClickAction(false, true)).toBe("open");
  });

  it("requires a parent challenge when opening without a camera unlock", () => {
    expect(homeworkCameraClickAction(false, false)).toBe("challenge");
  });
});

describe("homeworkCameraCaptureAllowed", () => {
  it("blocks capture when the camera gate is locked", () => {
    expect(homeworkCameraCaptureAllowed(false)).toBe(false);
  });

  it("allows capture after a live camera unlock", () => {
    expect(homeworkCameraCaptureAllowed(true)).toBe(true);
  });
});

describe("homeworkCameraIsUnlocked", () => {
  it("stays locked without a camera-only unlock (kid PIN / dashboard session do not count)", () => {
    expect(homeworkCameraIsUnlocked(false)).toBe(false);
  });

  it("unlocks only after the camera parent challenge", () => {
    expect(homeworkCameraIsUnlocked(true)).toBe(true);
  });
});

describe("homework camera unlock storage", () => {
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
    vi.useRealTimers();
  });

  it("starts locked and does not write the dashboard unlock key", () => {
    expect(isHomeworkCameraUnlockExpired()).toBe(true);
    markHomeworkCameraUnlocked();
    expect(isHomeworkCameraUnlockExpired()).toBe(false);
    expect(sessionStorage.getItem(PARENT_UNLOCK_KEY)).toBeNull();
    expect(sessionStorage.getItem(HOMEWORK_CAMERA_UNLOCK_KEY)).not.toBeNull();
  });

  it("does not treat a leftover dashboard unlock as a camera unlock (QA flake)", () => {
    markParentUnlocked();
    expect(isHomeworkCameraUnlockExpired()).toBe(true);
    expect(homeworkCameraIsUnlocked(!isHomeworkCameraUnlockExpired())).toBe(false);
    expect(homeworkCameraClickAction(false, !isHomeworkCameraUnlockExpired())).toBe("challenge");
    clearParentUnlock();
  });

  it("expires after the idle window without activity refresh", () => {
    vi.useFakeTimers();
    markHomeworkCameraUnlocked();
    vi.advanceTimersByTime(HOMEWORK_CAMERA_UNLOCK_MS + 1);
    expect(isHomeworkCameraUnlockExpired()).toBe(true);
    expect(homeworkCameraClickAction(false, !isHomeworkCameraUnlockExpired())).toBe("challenge");
  });

  it("clearHomeworkCameraUnlock removes the camera timestamp only", () => {
    markParentUnlocked();
    markHomeworkCameraUnlocked();
    clearHomeworkCameraUnlock();
    expect(sessionStorage.getItem(HOMEWORK_CAMERA_UNLOCK_KEY)).toBeNull();
    expect(sessionStorage.getItem(PARENT_UNLOCK_KEY)).not.toBeNull();
  });
});

describe("mapHomeworkParentError", () => {
  it("rewrites the host-only verify refusal", () => {
    expect(
      mapHomeworkParentError("Parent dashboard is only available on this computer."),
    ).toMatch(/Homeward computer/);
  });

  it("leaves other errors to the overlay defaults", () => {
    expect(mapHomeworkParentError("Invalid password")).toBeNull();
    expect(mapHomeworkParentError("")).toBeNull();
  });
});
