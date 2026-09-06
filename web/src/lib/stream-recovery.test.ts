import { describe, expect, it } from "vitest";
import {
  CHAT_UNAVAILABLE_MESSAGE,
  kidSafeStreamError,
  latestAssistantAfterUser,
  parseStreamHttpError,
} from "./stream-recovery";

describe("latestAssistantAfterUser", () => {
  it("returns the assistant reply after the matching user turn", () => {
    expect(
      latestAssistantAfterUser(
        [
          { role: "user", content: "hi" },
          { role: "assistant", content: "Hello there" },
          { role: "user", content: "why is the sky blue" },
          { role: "assistant", content: "Because of Rayleigh scattering." },
        ],
        "why is the sky blue",
      ),
    ).toBe("Because of Rayleigh scattering.");
  });

  it("prefers the latest matching user turn", () => {
    expect(
      latestAssistantAfterUser(
        [
          { role: "user", content: "hi" },
          { role: "assistant", content: "old" },
          { role: "user", content: "hi" },
          { role: "assistant", content: "new" },
        ],
        "hi",
      ),
    ).toBe("new");
  });

  it("returns null when the reply was not persisted yet", () => {
    expect(
      latestAssistantAfterUser([{ role: "user", content: "hi" }], "hi"),
    ).toBeNull();
  });
});

describe("kidSafeStreamError", () => {
  it("keeps useful gateway copy", () => {
    expect(kidSafeStreamError("PIN required")).toBe("PIN required");
  });

  it("hides raw Internal Server Error from kids", () => {
    expect(kidSafeStreamError("Internal Server Error")).toBe(CHAT_UNAVAILABLE_MESSAGE);
    expect(parseStreamHttpError({ message: "Internal Server Error" }, "Internal Server Error")).toBe(
      CHAT_UNAVAILABLE_MESSAGE,
    );
    expect(parseStreamHttpError({ detail: "Preset not found" }, "Internal Server Error")).toBe(
      "Preset not found",
    );
  });
});
