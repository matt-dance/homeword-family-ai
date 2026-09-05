/** Kid-safe copy — keep in sync with gateway `LLM_UNAVAILABLE_MESSAGE`. */
export const LLM_UNAVAILABLE_MESSAGE =
  "Homeward's brain is taking a nap right now. Ask a parent to check the AI status on the dashboard, then try again.";

export type KidSafeChatError = {
  blocked: true;
  message: string;
  session_id: number | null;
  tools: unknown[];
};

export function kidSafeChatError(sessionId?: number | null): KidSafeChatError {
  return {
    blocked: true,
    message: LLM_UNAVAILABLE_MESSAGE,
    session_id: sessionId ?? null,
    tools: [],
  };
}

/** Bare 5xx / non-JSON failures become nap JSON; already-structured errors pass through. */
export function shouldReplaceWithKidSafeChatError(status: number, body: unknown): boolean {
  if (status < 500) return false;
  if (
    body &&
    typeof body === "object" &&
    (body as { blocked?: unknown }).blocked === true &&
    typeof (body as { message?: unknown }).message === "string"
  ) {
    return false;
  }
  return true;
}
