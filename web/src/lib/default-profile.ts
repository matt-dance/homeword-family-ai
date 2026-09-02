export const QUICK_CHAT_SLUG = "quick";
export const QUICK_CHAT_LABEL = "Quick Chat";

/** Anonymous shared chat that uses the household default profile's safety settings. */
export function chatPathForQuickChat(): string {
  return `/chat/${QUICK_CHAT_SLUG}`;
}
