import { describe, expect, it } from "vitest";
import { chatRequiresPin } from "./chat-pin";

describe("chatRequiresPin", () => {
  it("requires a PIN for named profiles that have one", () => {
    expect(chatRequiresPin({ hasPin: true, quickChat: false })).toBe(true);
  });

  it("skips the household PIN for anonymous Quick Chat", () => {
    expect(chatRequiresPin({ hasPin: true, quickChat: true })).toBe(false);
  });

  it("does not require a PIN when the profile has none", () => {
    expect(chatRequiresPin({ hasPin: false, quickChat: false })).toBe(false);
    expect(chatRequiresPin({ hasPin: false, quickChat: true })).toBe(false);
    expect(chatRequiresPin({ quickChat: false })).toBe(false);
  });
});
