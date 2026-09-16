import { describe, expect, it } from "vitest";
import {
  isCompleteHouseCode,
  normalizeHouseCode,
  spokenHouseCode,
} from "./house-code";

describe("house code", () => {
  it("keeps only four digits", () => {
    expect(normalizeHouseCode("48-21")).toBe("4821");
    expect(normalizeHouseCode("48219")).toBe("4821");
    expect(normalizeHouseCode("ab12")).toBe("12");
  });

  it("is complete only with four digits", () => {
    expect(isCompleteHouseCode("4821")).toBe(true);
    expect(isCompleteHouseCode("482")).toBe(false);
    expect(isCompleteHouseCode("pin1")).toBe(false);
  });

  it("speaks the house code as digits, not as a PIN", () => {
    expect(spokenHouseCode("4821")).toBe("4 8 2 1");
  });
});
