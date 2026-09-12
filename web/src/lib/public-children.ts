import type { Child } from "@/lib/api";

/** Public picker payloads must be a child array — never crash the kid UI. */
export function asChildList(value: unknown): Child[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Child => {
    if (!item || typeof item !== "object") return false;
    return typeof (item as { id?: unknown }).id === "number";
  });
}
