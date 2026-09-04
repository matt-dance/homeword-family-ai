/** Parent-gated homework camera: open/capture require a live parent unlock. */

export type HomeworkCameraClickAction = "open" | "close" | "challenge";

/**
 * Camera-button click: closing never needs a challenge; opening does unless
 * a parent session is already unlocked on this browser (idle lock still valid).
 */
export function homeworkCameraClickAction(
  currentlyOpen: boolean,
  parentUnlocked: boolean,
): HomeworkCameraClickAction {
  if (currentlyOpen) return "close";
  return parentUnlocked ? "open" : "challenge";
}

/** Snap / upload / hint submit stay gated even if the panel is already visible. */
export function homeworkCameraCaptureAllowed(parentUnlocked: boolean): boolean {
  return parentUnlocked;
}

/** Friendlier copy when parent login is refused off the Homeward computer. */
export function mapHomeworkParentError(message: string): string | null {
  if (message.toLowerCase().includes("only available on this computer")) {
    return "Ask a parent to unlock the worksheet camera on the Homeward computer.";
  }
  return null;
}
