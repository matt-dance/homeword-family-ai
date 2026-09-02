import { describe, expect, it } from "vitest";
import { chatPathForDefaultProfile, resolveDefaultChild } from "./default-profile";
import type { Child } from "@/lib/api";

const children: Child[] = [
  { id: 1, name: "Emma", slug: "emma", has_pin: true },
  { id: 2, name: "Sam", slug: "sam", has_pin: false },
];

describe("default-profile", () => {
  it("prefers configured default profile", () => {
    expect(resolveDefaultChild(children, 1)?.id).toBe(1);
  });

  it("falls back to profile without PIN", () => {
    expect(resolveDefaultChild(children)?.id).toBe(2);
  });

  it("builds quick chat path for default profile", () => {
    expect(chatPathForDefaultProfile(children, 1)).toBe("/chat/quick");
  });
});
