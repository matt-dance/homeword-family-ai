import { describe, expect, it } from "vitest";
import { getAgeTheme } from "./age-theme";

describe("age-theme", () => {
  it("determines young theme for age <= 8 or preset young_explorer", () => {
    expect(getAgeTheme({ age: 6, preset_id: "young_explorer" })).toBe("young");
    expect(getAgeTheme({ age: 7 })).toBe("young");
    expect(getAgeTheme({ preset_id: "young_explorer" })).toBe("young");
  });

  it("determines curious theme for age 9-12 or preset curious_explorer", () => {
    expect(getAgeTheme({ age: 10, preset_id: "curious_explorer" })).toBe("curious");
    expect(getAgeTheme({ age: 11 })).toBe("curious");
    expect(getAgeTheme({ preset_id: "curious_explorer" })).toBe("curious");
  });

  it("determines teen theme for age >= 13 or preset teen_guided", () => {
    expect(getAgeTheme({ age: 14, preset_id: "teen_guided" })).toBe("teen");
    expect(getAgeTheme({ age: 16 })).toBe("teen");
    expect(getAgeTheme({ preset_id: "teen_guided" })).toBe("teen");
  });

  it("defaults to curious theme if no child provided", () => {
    expect(getAgeTheme(undefined)).toBe("curious");
  });

  it("uses the QA child presets instead of defaulting every profile to curious", () => {
    expect(getAgeTheme({ name: "Avery", age: 7, preset_id: "young_explorer" } as { age: number; preset_id: string })).toBe("young");
    expect(getAgeTheme({ age: 11, preset_id: "curious_explorer" })).toBe("curious");
    expect(getAgeTheme({ age: 15, preset_id: "teen_guided" })).toBe("teen");
  });

  it("prefers preset_id when age and preset disagree", () => {
    expect(getAgeTheme({ age: 7, preset_id: "teen_guided" })).toBe("teen");
    expect(getAgeTheme({ age: 15, preset_id: "young_explorer" })).toBe("young");
  });

  it("defaults to curious when public child payloads omit age and preset", () => {
    expect(getAgeTheme({} as { age?: number; preset_id?: string })).toBe("curious");
  });
});
