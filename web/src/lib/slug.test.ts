import { describe, expect, it } from "vitest";
import { chatPathForChild, slugifyName } from "./slug";

describe("slugifyName", () => {
  it("lowercases and hyphenates names", () => {
    expect(slugifyName("Lincoln")).toBe("lincoln");
    expect(slugifyName("  Emma Rose  ")).toBe("emma-rose");
  });

  it("falls back for empty slugs", () => {
    expect(slugifyName("!!!")).toBe("child");
  });
});

describe("chatPathForChild", () => {
  it("builds a per-child chat path", () => {
    expect(chatPathForChild({ name: "Lincoln", slug: "lincoln" })).toBe("/chat/lincoln");
    expect(chatPathForChild({ name: "Lincoln" })).toBe("/chat/lincoln");
  });
});
