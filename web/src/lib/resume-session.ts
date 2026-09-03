export interface ResumeMessage {
  role: string;
  content: string;
  blocked?: boolean;
}

export interface ResumeSessionLike {
  session_id?: number;
  messages?: ResumeMessage[];
}

export function isResumableSession(session: ResumeSessionLike | null | undefined): boolean {
  if (!session || typeof session.session_id !== "number") return false;
  const messages = Array.isArray(session.messages) ? session.messages : [];
  return messages.some((message) => (message.content || "").trim().length > 0);
}

export function shouldOfferResume({
  allowResume,
  quickChat,
  session,
}: {
  allowResume?: boolean;
  quickChat: boolean;
  session: ResumeSessionLike | null;
}): boolean {
  if (quickChat || allowResume === false) return false;
  return isResumableSession(session);
}
