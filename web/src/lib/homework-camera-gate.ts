import { PARENT_LOCK_IDLE_MS } from "@/lib/parent-lock";

/** Parent-gated homework camera: open/capture require a camera-only unlock. */

export type HomeworkCameraClickAction = "open" | "close" | "challenge";

/**
 * One-shot camera unlock. Independent of kid PIN and of the dashboard idle
 * lock so leftover /dashboard activity cannot skip the parent challenge.
 */
export const HOMEWORK_CAMERA_UNLOCK_KEY = "homeward-homework-camera-unlocked-at";
export const HOMEWORK_CAMERA_UNLOCK_MS = PARENT_LOCK_IDLE_MS;

function storage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function markHomeworkCameraUnlocked(now = Date.now()): void {
  storage()?.setItem(HOMEWORK_CAMERA_UNLOCK_KEY, String(now));
}

export function clearHomeworkCameraUnlock(): void {
  storage()?.removeItem(HOMEWORK_CAMERA_UNLOCK_KEY);
}

export function isHomeworkCameraUnlockExpired(now = Date.now()): boolean {
  const raw = storage()?.getItem(HOMEWORK_CAMERA_UNLOCK_KEY);
  if (!raw) return true;
  const unlockedAt = Number.parseInt(raw, 10);
  if (Number.isNaN(unlockedAt)) return true;
  return now - unlockedAt >= HOMEWORK_CAMERA_UNLOCK_MS;
}

/**
 * Only a successful camera password challenge unlocks the panel.
 * A dashboard idle unlock or child PIN must never count.
 */
export function homeworkCameraIsUnlocked(cameraUnlocked: boolean): boolean {
  return cameraUnlocked;
}

/**
 * Camera-button click: closing never needs a challenge; opening does unless
 * this browser already completed the camera parent challenge (idle window).
 */
export function homeworkCameraClickAction(
  currentlyOpen: boolean,
  gateUnlocked: boolean,
): HomeworkCameraClickAction {
  if (currentlyOpen) return "close";
  return gateUnlocked ? "open" : "challenge";
}

/** Snap / upload / hint submit stay gated even if the panel is already visible. */
export function homeworkCameraCaptureAllowed(gateUnlocked: boolean): boolean {
  return gateUnlocked;
}

/** Friendlier copy when parent verify is refused off the Homeward computer. */
export function mapHomeworkParentError(message: string): string | null {
  if (message.toLowerCase().includes("only available on this computer")) {
    return "Ask a parent to unlock the worksheet camera on the Homeward computer.";
  }
  return null;
}
