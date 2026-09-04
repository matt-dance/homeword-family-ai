import { describe, expect, it } from "vitest";
import {
  homeworkCameraCaptureAllowed,
  homeworkCameraClickAction,
  mapHomeworkParentError,
} from "./homework-camera-gate";

describe("homeworkCameraClickAction", () => {
  it("closes without a challenge when the panel is already open", () => {
    expect(homeworkCameraClickAction(true, false)).toBe("close");
    expect(homeworkCameraClickAction(true, true)).toBe("close");
  });

  it("opens immediately when a parent session is still unlocked", () => {
    expect(homeworkCameraClickAction(false, true)).toBe("open");
  });

  it("requires a parent challenge when opening without an unlocked session", () => {
    expect(homeworkCameraClickAction(false, false)).toBe("challenge");
  });
});

describe("homeworkCameraCaptureAllowed", () => {
  it("blocks capture when the parent lock has expired", () => {
    expect(homeworkCameraCaptureAllowed(false)).toBe(false);
  });

  it("allows capture after a live parent unlock", () => {
    expect(homeworkCameraCaptureAllowed(true)).toBe(true);
  });
});

describe("mapHomeworkParentError", () => {
  it("rewrites the host-only login refusal", () => {
    expect(
      mapHomeworkParentError("Parent dashboard is only available on this computer."),
    ).toMatch(/Homeward computer/);
  });

  it("leaves other errors to the overlay defaults", () => {
    expect(mapHomeworkParentError("Invalid password")).toBeNull();
    expect(mapHomeworkParentError("")).toBeNull();
  });
});
