export interface ResumeMessage {
  role: string;
  content: string;
  blocked?: boolean;
}

export interface ResumeSessionLike {
  session_id?: number;
  messages?: ResumeMessage[];
}

export function isResumableSession(
  session: ResumeSessionLike | null | undefined,
): session is ResumeSessionLike & { session_id: number } {
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

export type ResumeChoice = "continue" | "fresh";

export type AfterPinUnlockAction = "resume" | "fresh" | "offer";

/**
 * After a PIN unlock, honor an in-progress Welcome-back choice so Continue
 * last chat cannot bounce back to the chooser.
 */
export function actionAfterPinUnlock({
  pendingChoice,
  allowResume,
  quickChat,
}: {
  pendingChoice: ResumeChoice | null;
  allowResume?: boolean;
  quickChat: boolean;
}): AfterPinUnlockAction {
  if (pendingChoice === "continue") return "resume";
  if (pendingChoice === "fresh") return "fresh";
  if (quickChat || allowResume === false) return "fresh";
  return "offer";
}

export function resumeTranscript(
  session: ResumeSessionLike | null | undefined,
): Array<{ role: "user" | "assistant"; content: string; blocked?: boolean }> {
  if (!session || typeof session.session_id !== "number") return [];
  const messages = Array.isArray(session.messages) ? session.messages : [];
  return messages.flatMap((message) => {
    const content = (message.content || "").trim();
    if (!content) return [];
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [
      {
        role: message.role,
        content: message.content,
        blocked: message.blocked,
      },
    ];
  });
}
