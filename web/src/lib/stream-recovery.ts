export interface RecoverableChatMessage {
  role: string;
  content: string;
  blocked?: boolean;
}

const GENERIC_SERVER_ERRORS = new Set([
  "internal server error",
  "internal error",
  "error",
  "stream failed",
]);

/** Kid-safe copy when the proxy/gateway returns a raw 500. */
export const CHAT_UNAVAILABLE_MESSAGE =
  "Homeward had trouble answering just now. Please try again in a moment.";

export function latestAssistantAfterUser(
  messages: RecoverableChatMessage[] | null | undefined,
  userMessage: string,
): string | null {
  const needle = userMessage.trim();
  if (!needle || !Array.isArray(messages) || messages.length === 0) return null;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user" || (message.content || "").trim() !== needle) {
      continue;
    }
    const next = messages[i + 1];
    const reply = (next?.content || "").trim();
    if (next?.role === "assistant" && reply) {
      return next.content;
    }
    return null;
  }
  return null;
}

export function kidSafeStreamError(detail: unknown, fallback = CHAT_UNAVAILABLE_MESSAGE): string {
  const text =
    typeof detail === "string"
      ? detail.trim()
      : Array.isArray(detail)
        ? detail
            .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : ""))
            .filter(Boolean)
            .join(", ")
        : "";
  if (!text) return fallback;
  if (GENERIC_SERVER_ERRORS.has(text.toLowerCase())) return fallback;
  return text;
}

export function parseStreamHttpError(payload: unknown, statusText: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as { detail?: unknown; message?: unknown };
    if (record.detail !== undefined) {
      return kidSafeStreamError(record.detail);
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return kidSafeStreamError(record.message);
    }
  }
  return kidSafeStreamError(statusText);
}
