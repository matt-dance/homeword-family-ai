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

export function snapshotLastChat(
  sessionId: number | null | undefined,
  messages: ResumeMessage[] | null | undefined,
): ResumeSessionLike | null {
  if (typeof sessionId !== "number") return null;
  const session = { session_id: sessionId, messages: messages ?? [] };
  return isResumableSession(session) ? session : null;
}

/**
 * Start fresh + new turns should win over an older resume GET/cache.
 * Same session id keeps the longer transcript (live chat vs a stale fetch).
 */
export function preferCanonicalLastChat(
  fetched: ResumeSessionLike | null | undefined,
  remembered: ResumeSessionLike | null | undefined,
): ResumeSessionLike | null {
  const fromApi = isResumableSession(fetched) ? fetched : null;
  const fromLive = isResumableSession(remembered) ? remembered : null;
  if (!fromApi) return fromLive;
  if (!fromLive) return fromApi;
  if (fromLive.session_id !== fromApi.session_id) {
    return fromLive.session_id > fromApi.session_id ? fromLive : fromApi;
  }
  const liveCount = Array.isArray(fromLive.messages) ? fromLive.messages.length : 0;
  const apiCount = Array.isArray(fromApi.messages) ? fromApi.messages.length : 0;
  return liveCount >= apiCount ? fromLive : fromApi;
}

function lastChatStorageKey(childId: number) {
  return `homeward-last-chat-${childId}`;
}

export function readRememberedLastChat(childId: number): ResumeSessionLike | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(lastChatStorageKey(childId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeSessionLike;
    return isResumableSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRememberedLastChat(
  childId: number,
  session: ResumeSessionLike | null,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const key = lastChatStorageKey(childId);
    if (!isResumableSession(session)) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(
      key,
      JSON.stringify({
        session_id: session.session_id,
        messages: session.messages,
      }),
    );
  } catch {
    // Private mode / quota — resume still has the API path.
  }
}
