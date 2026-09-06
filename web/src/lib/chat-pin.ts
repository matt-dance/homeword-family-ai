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
