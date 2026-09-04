export interface ReplyChip {
  id: "simpler" | "more" | "quiz";
  label: string;
  message: string;
}

export const REPLY_CHIPS: ReplyChip[] = [
  { id: "simpler", label: "Say that simpler", message: "Say that simpler." },
  { id: "more", label: "Tell me more", message: "Tell me more." },
  { id: "quiz", label: "Quiz me on that", message: "Quiz me on that." },
];

export function shouldShowReplyChips({
  streaming,
  blocked,
  isLastAssistant,
}: {
  streaming: boolean;
  blocked?: boolean;
  isLastAssistant: boolean;
}): boolean {
  return isLastAssistant && !streaming && !blocked;
}
