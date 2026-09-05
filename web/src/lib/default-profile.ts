export const QUICK_CHAT_SLUG = "quick";
export const QUICK_CHAT_LABEL = "Quick Chat";

/** Anonymous shared chat: household default safety settings, no kid PIN, no named memory. */
export function chatPathForQuickChat(): string {
  return `/chat/${QUICK_CHAT_SLUG}`;
}
