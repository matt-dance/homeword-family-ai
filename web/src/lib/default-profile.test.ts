import { describe, expect, it } from "vitest";
import { chatPathForQuickChat, QUICK_CHAT_SLUG } from "./default-profile";

describe("default-profile", () => {
  it("quick chat path uses the reserved slug", () => {
    expect(chatPathForQuickChat()).toBe(`/chat/${QUICK_CHAT_SLUG}`);
  });
});
