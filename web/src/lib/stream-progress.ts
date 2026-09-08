/** Whether the kid chat should keep the working indicator visible. */

export function lastAssistantHasText(
  lastMessage?: { role?: string; content?: string } | null,
): boolean {
  if (!lastMessage || lastMessage.role !== "assistant") return false;
  return Boolean(lastMessage.content?.trim());
}

export function shouldShowStreamThinking(
  streaming: boolean,
  lastMessage?: { role?: string; content?: string } | null,
): boolean {
  if (!streaming) return false;
  return !lastAssistantHasText(lastMessage);
}

export function streamComposerHint(status: string | null | undefined): string {
  const phase = (status || "Still working on your answer…").trim();
  return `${phase} Tap Stop if you want to ask something else.`;
}
