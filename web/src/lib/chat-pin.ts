/** Named profiles with a PIN stay gated. Quick Chat is anonymous and skips that PIN. */
export function chatRequiresPin({
  hasPin,
  quickChat,
}: {
  hasPin?: boolean;
  quickChat: boolean;
}): boolean {
  return Boolean(hasPin) && !quickChat;
}

/** Server-side named-profile gate. Wrong PIN is a different error ("Invalid PIN"). */
export function isPinAccessError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.trim().toLowerCase() === "pin required";
}
