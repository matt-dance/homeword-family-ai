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

/** True when the on-screen transcript was produced for this session id. */
export function messagesBelongToSession(
  chatSessionId: number | null | undefined,
  ownerSessionId: number | null | undefined,
): boolean {
  return typeof chatSessionId === "number" && chatSessionId === ownerSessionId;
}

/**
 * Keep the newest session. A later write of an older id must not put the
 * previous transcript back on top of Start fresh.
 */
export function foldRememberedLastChat(
  existing: ResumeSessionLike | null | undefined,
  incoming: ResumeSessionLike,
): ResumeSessionLike {
  if (!isResumableSession(existing)) return incoming;
  if (!isResumableSession(incoming)) return existing;
  if (incoming.session_id < existing.session_id) return existing;
  if (incoming.session_id > existing.session_id) return incoming;
  const incomingCount = Array.isArray(incoming.messages) ? incoming.messages.length : 0;
  const existingCount = Array.isArray(existing.messages) ? existing.messages.length : 0;
  if (incomingCount < existingCount) return existing;
  return incoming;
}

function lastChatStorageKey(childId: number) {
  return `homeward-last-chat-${childId}`;
}

function browserStores(): Array<{ store: Storage; durable: boolean }> {
  const stores: Array<{ store: Storage; durable: boolean }> = [];
  try {
    if (typeof localStorage !== "undefined") stores.push({ store: localStorage, durable: true });
  } catch {
    // Blocked storage — fall through to sessionStorage.
  }
  try {
    if (typeof sessionStorage !== "undefined") stores.push({ store: sessionStorage, durable: false });
  } catch {
    // Blocked storage — resume still has the API path.
  }
  return stores;
}

function readStoredSession(store: Storage, childId: number): ResumeSessionLike | null {
  try {
    const raw = store.getItem(lastChatStorageKey(childId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeSessionLike;
    return isResumableSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readRememberedLastChat(childId: number): ResumeSessionLike | null {
  // localStorage survives a profile switch that starts a new page session.
  // sessionStorage covers the same tab if local storage is blocked.
  const stores = browserStores();
  const durable = stores.find((entry) => entry.durable);
  if (durable) {
    const fromLocal = readStoredSession(durable.store, childId);
    if (fromLocal) return fromLocal;
  }
  for (const entry of stores) {
    if (entry.durable) continue;
    const found = readStoredSession(entry.store, childId);
    if (found) return found;
  }
  return null;
}

export function writeRememberedLastChat(
  childId: number,
  session: ResumeSessionLike | null,
): void {
  const stores = browserStores();
  if (stores.length === 0) return;
  const key = lastChatStorageKey(childId);
  try {
    if (!isResumableSession(session)) {
      for (const entry of stores) entry.store.removeItem(key);
      return;
    }
    const next = foldRememberedLastChat(readRememberedLastChat(childId), session);
    const payload = JSON.stringify({
      session_id: next.session_id,
      messages: next.messages,
    });
    for (const entry of stores) entry.store.setItem(key, payload);
  } catch {
    // Private mode / quota — resume still has the API path.
  }
}
