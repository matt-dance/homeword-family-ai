import { describe, expect, it } from "vitest";
import { getAgeTheme, AGE_THEME_CONFIGS } from "./age-theme";

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

  it("has complete configuration for all 3 age groups", () => {
    expect(AGE_THEME_CONFIGS.young.avatarEmoji).toBeDefined();
    expect(AGE_THEME_CONFIGS.curious.avatarEmoji).toBeDefined();
    expect(AGE_THEME_CONFIGS.teen.avatarEmoji).toBeDefined();
  });
});
