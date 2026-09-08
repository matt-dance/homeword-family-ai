import { describe, expect, it } from "vitest";
import { chatRequiresPin, isPinAccessError } from "./chat-pin";

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

describe("isPinAccessError", () => {
  it("detects the named-profile access gate", () => {
    expect(isPinAccessError(new Error("PIN required"))).toBe(true);
    expect(isPinAccessError("PIN required")).toBe(true);
  });

  it("does not treat a wrong PIN or other failures as a missing unlock", () => {
    expect(isPinAccessError(new Error("Invalid PIN"))).toBe(false);
    expect(isPinAccessError(new Error("That PIN doesn't match. Try again!"))).toBe(false);
    expect(isPinAccessError(new Error("Too many attempts. Try again later."))).toBe(false);
  });
});
