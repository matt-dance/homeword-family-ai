import type { Child } from "@/lib/api";

export const QUICK_CHAT_SLUG = "quick";
export const QUICK_CHAT_LABEL = "Quick Chat";

export function chatPathForQuickChat(): string {
  return `/chat/${QUICK_CHAT_SLUG}`;
}

/** Resolve the household default profile for quick chat links. */
export function resolveDefaultChild(
  children: Child[],
  defaultProfileChildId?: number | null,
): Child | null {
  if (children.length === 0) return null;

  if (defaultProfileChildId != null) {
    const chosen = children.find((child) => child.id === defaultProfileChildId);
    if (chosen) return chosen;
  }

  const withoutPin = children.find((child) => !child.has_pin);
  return withoutPin ?? children[0];
}

export function chatPathForDefaultProfile(
  children: Child[],
  defaultProfileChildId?: number | null,
): string {
  const child = resolveDefaultChild(children, defaultProfileChildId);
  return child ? chatPathForQuickChat() : "/chat";
}
