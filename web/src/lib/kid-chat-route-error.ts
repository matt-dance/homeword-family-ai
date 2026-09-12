import { STREAM_STALL_MESSAGE } from "@/lib/kid-chat-stream-error";

/** Generic client-exception copy — do not claim the model is down. */
export const KID_CHAT_ROUTE_EXCEPTION_MESSAGE =
  "Something got tangled up. You can try again, or pick a different profile.";

/**
 * Nap copy is only for a confirmed unreadiness signal.
 * A client throw while Ollama is online must not masquerade as a nap.
 */
export function kidChatRouteErrorMessage(ollamaReady: boolean | null): string {
  if (ollamaReady === false) return STREAM_STALL_MESSAGE;
  return KID_CHAT_ROUTE_EXCEPTION_MESSAGE;
}

export function ollamaReadyFromHealth(health: { ollama?: { ready?: boolean } } | null): boolean {
  return health?.ollama?.ready === true;
}
