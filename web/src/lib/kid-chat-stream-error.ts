import { LLM_UNAVAILABLE_MESSAGE } from "@/lib/nonstream-chat-error";
import { kidSafeStreamError } from "@/lib/stream-recovery";

const ABORT_REASON_RE = /^(idle-timeout|total-timeout|header-timeout)$/i;
const ABORT_MESSAGE_RE =
  /abort|aborted|terminated|the operation was aborted|network error|failed to fetch|the user aborted/i;

/** Kid-safe copy for a stalled/errored SSE turn (cold Ollama, idle, truncated stream). */
export const STREAM_STALL_MESSAGE = LLM_UNAVAILABLE_MESSAGE;

/**
 * Log the console stack whenever kid-chat streaming fails.
 * Always records a stack, even when the thrown value is a string abort reason.
 */
export function reportKidChatStreamFailure(error: unknown, context: string): void {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" && error.trim() ? error : "kid-chat stream failure");
  const stack = err.stack || new Error("kid-chat stream failure").stack;
  console.error("[homeward] kid-chat stream failure", context, err.message, stack, error);
}

export function isAbortLikeError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "string") {
    return ABORT_REASON_RE.test(error) || ABORT_MESSAGE_RE.test(error);
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") return true;
    if (ABORT_MESSAGE_RE.test(error.message) || ABORT_REASON_RE.test(error.message)) return true;
  }
  if (typeof error === "object" && "name" in error) {
    const name = String((error as { name: unknown }).name || "");
    if (name === "AbortError" || name === "TimeoutError") return true;
  }
  return false;
}

/** Coerce stream/UI text so React never receives a non-string child. */
export function kidText(value: unknown, fallback = STREAM_STALL_MESSAGE): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/**
 * Map any thrown stream failure to kid-safe copy.
 * Abort reasons like "idle-timeout" must never reach the chat bubble or error page.
 */
export function kidSafeUnhandledStreamMessage(error: unknown): string {
  if (isAbortLikeError(error)) return STREAM_STALL_MESSAGE;
  if (error instanceof Error && error.message.trim()) {
    if (ABORT_REASON_RE.test(error.message)) return STREAM_STALL_MESSAGE;
    return kidSafeStreamError(error.message, STREAM_STALL_MESSAGE);
  }
  if (typeof error === "string" && error.trim()) {
    if (ABORT_REASON_RE.test(error)) return STREAM_STALL_MESSAGE;
    return kidSafeStreamError(error, STREAM_STALL_MESSAGE);
  }
  return STREAM_STALL_MESSAGE;
}

export function invokeSafely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    reportKidChatStreamFailure(error, label);
  }
}
