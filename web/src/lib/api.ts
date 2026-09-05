import { decodeSpeechPayload } from "@/lib/read-aloud";
import type { ChatTool } from "@/lib/chat-tools";
import { markParentUnlocked } from "@/lib/parent-lock";
import {
  CHAT_UNAVAILABLE_MESSAGE,
  latestAssistantAfterUser,
  parseStreamHttpError,
} from "@/lib/stream-recovery";

const API_BASE = "/api/v1";

export interface Preset {
  id: string;
  name: string;
  description: string;
  age_min: number;
  age_max: number;
  strictness_default: number;
}

export interface Child {
  id: number;
  name: string;
  slug?: string;
  age?: number;
  preset_id?: string;
  strictness?: number;
  has_pin?: boolean;
  homework_mode?: boolean;
  live_lookups?: boolean;
  voice_gender?: "female" | "male";
  allow_resume?: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  quiet_hours_days?: string | null;
  chat_available?: boolean;
  chat_unavailable_message?: string | null;
  is_default?: boolean;
}

export interface ChildMemoryItem {
  id: string;
  label: string;
  value: string;
}

export interface ConversationStarter {
  label: string;
  message: string;
}

export interface ResumableSession {
  session_id: number;
  messages: Array<{ role: string; content: string; blocked?: boolean }>;
  preview: string | null;
}

export interface SetupStatus {
  setup_complete: boolean;
  has_parent: boolean;
}

export interface ConversationLog {
  id: number;
  child_id: number;
  session_id?: number | null;
  direction: string;
  content: string;
  blocked: boolean;
  block_reason: string | null;
  created_at: string;
}

export interface ChatSessionSummary {
  id: string;
  legacy: boolean;
  child_id: number;
  preview: string;
  message_count: number;
  started_at: string;
  last_at: string;
  summary?: string | null;
}

export interface BlockedAttempt {
  id: number;
  child_id: number;
  content: string;
  reason: string;
  stage: string;
  created_at: string;
}

export interface OllamaStatus {
  reachable: boolean;
  managed?: boolean;
  ollama_url: string;
  system_ram_gb: number;
  ram_detection?: string;
  installed_models: string[];
  chat_model: string;
  classifier_model: string;
  chat_model_ready: boolean;
  classifier_model_ready: boolean;
  ready: boolean;
  bootstrap_hint?: string | null;
}

export interface OllamaModelOption {
  id: string;
  name: string;
  description: string;
  min_ram_gb: number;
  size_gb: number;
  tier: string;
  fits_machine: boolean;
  installed: boolean;
  recommended: boolean;
  selected_chat: boolean;
  selected_classifier: boolean;
  from_ollama?: boolean;
}

export interface OllamaRecommendation {
  system_ram_gb: number;
  ram_detection: string;
  ollama_reachable: boolean;
  recommended_model: string;
  models: OllamaModelOption[];
  other_installed: OllamaModelOption[];
  installed_models: string[];
}

export interface OllamaPullJob {
  job_id: string;
  model: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
          : "Request failed";
    throw new Error(message || "Request failed");
  }
  return res.json();
}

/** A fresh sign-in should not be greeted by the idle-lock overlay. */
function unlockParentUi<T>(result: T): T {
  markParentUnlocked();
  return result;
}

export const api = {
  health: () =>
    request<{ status: string; ollama?: { ready: boolean } }>("/health"),
  setupStatus: () => request<SetupStatus>("/setup/status"),
  setup: (password: string) =>
    request<{ ok: boolean; resumed?: boolean; recovery_code?: string }>("/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    }).then(unlockParentUi),
  completeSetup: () =>
    request<{ ok: boolean }>("/setup/complete", { method: "POST" }),
  login: (password: string) =>
    request<{ ok: boolean; setup_complete: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }).then(unlockParentUi),
  resetPassword: (recovery_code: string, new_password: string) =>
    request<{ ok: boolean; recovery_code: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ recovery_code, new_password }),
    }).then(unlockParentUi),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () =>
    request<{
      parent_id: number;
      setup_complete: boolean;
      cloud_enabled: boolean;
      ollama_model: string | null;
      classifier_model: string | null;
      has_recovery_code: boolean;
    }>("/auth/me"),
  presets: () => request<Preset[]>("/presets"),
  children: () => request<Child[]>("/children"),
  childrenPublic: () => request<Child[]>("/children/public"),
  createChild: (data: {
    name: string;
    age: number;
    preset_id?: string;
    strictness: number;
    pin?: string;
    homework_mode?: boolean;
    live_lookups?: boolean;
    voice_gender?: "female" | "male";
  }) =>
    request<Child>("/children", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateChild: (
    childId: number,
    data: Partial<{
      name: string;
      age: number;
      preset_id: string;
      strictness: number;
      pin: string;
      clear_pin: boolean;
      homework_mode: boolean;
      live_lookups: boolean;
      voice_gender: "female" | "male";
      allow_resume: boolean;
      quiet_hours_enabled: boolean;
      quiet_hours_start: string;
      quiet_hours_end: string;
      quiet_hours_days: string;
    }>,
  ) =>
    request<Child>(`/children/${childId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  conversationStarters: (childId: number) =>
    request<ConversationStarter[]>(`/children/${childId}/starters`),
  childMemory: (childId: number) =>
    request<{ items: ChildMemoryItem[] }>(`/children/${childId}/memory`),
  addChildMemory: (childId: number, data: { label: string; value: string }) =>
    request<ChildMemoryItem>(`/children/${childId}/memory`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateChildMemory: (
    childId: number,
    itemId: string,
    data: Partial<{ label: string; value: string }>,
  ) =>
    request<ChildMemoryItem>(`/children/${childId}/memory/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteChildMemory: (childId: number, itemId: string) =>
    request<{ ok: boolean }>(`/children/${childId}/memory/${itemId}`, {
      method: "DELETE",
    }),
  wipeChildMemory: (childId: number) =>
    request<{ ok: boolean }>(`/children/${childId}/memory`, { method: "DELETE" }),
  resumeSession: (childId: number) =>
    request<ResumableSession>(`/children/${childId}/sessions/resume`),
  verifyPin: (childId: number, pin: string) =>
    request<{ ok: boolean; child_id: number; name: string }>(
      `/children/${childId}/verify-pin`,
      { method: "POST", body: JSON.stringify({ pin }) }
    ),
  sessions: (childId?: number) =>
    request<ChatSessionSummary[]>(
      `/dashboard/sessions${childId != null ? `?child_id=${childId}` : ""}`,
    ),
  sessionMessages: (sessionId: string) =>
    request<ConversationLog[]>(`/dashboard/sessions/${sessionId}/messages`),
  deleteSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/dashboard/sessions/${sessionId}`, { method: "DELETE" }),
  deleteChildSessions: (childId: number) =>
    request<{ ok: boolean }>(`/dashboard/sessions?child_id=${childId}`, { method: "DELETE" }),
  createChatSession: (childId: number, endSessionId?: number) =>
    request<{ session_id: number; started_at: string }>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ child_id: childId, end_session_id: endSessionId ?? null }),
    }),
  transcribeStatus: () =>
    request<{ available: boolean; ready: boolean; model: string; message: string | null }>(
      "/chat/transcribe/status",
    ),
  transcribeAudio: async (blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, blob.type.includes("mp4") ? "speech.mp4" : "speech.webm");
    const res = await fetch(`${API_BASE}/chat/transcribe`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      throw new Error(typeof detail === "string" ? detail : "Could not transcribe audio");
    }
    return res.json() as Promise<{ text: string }>;
  },
  speakStatus: () =>
    request<{ available: boolean; ready: boolean; voice: string; message: string | null }>(
      "/chat/speak/status",
    ),
  /** Verifies the parent password without minting a dashboard session cookie. */
  homeworkUnlock: (password: string) =>
    request<{ ok: boolean }>("/chat/homework/unlock", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  homeworkStatus: (childId: number) =>
    request<{
      homework_mode: boolean;
      available: boolean;
      ready: boolean;
      model: string | null;
      expected_model: string;
      message: string | null;
    }>(`/chat/homework/status?child_id=${childId}`),
  homeworkHint: async (childId: number, blob: Blob, question?: string) => {
    const form = new FormData();
    const ext = blob.type.includes("jpeg") || blob.type.includes("jpg")
      ? "jpg"
      : blob.type.includes("webp")
        ? "webp"
        : "png";
    form.append("image", blob, `worksheet.${ext}`);
    form.append("child_id", String(childId));
    if (question?.trim()) form.append("question", question.trim());
    const res = await fetch(`${API_BASE}/chat/homework/hint`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      throw new Error(typeof detail === "string" ? detail : "Could not get a homework hint");
    }
    return res.json() as Promise<{
      hint: string;
      vision_available: boolean;
      model: string | null;
      expected_model: string;
    }>;
  },
  speakText: async (text: string, voiceGender?: "female" | "male") => {
    const res = await fetch(`${API_BASE}/chat/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_gender: voiceGender }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      throw new Error(typeof detail === "string" ? detail : "Could not read text aloud");
    }
    const data = (await res.json()) as {
      audio_base64: string;
      words: Array<{ word: string; start: number; end: number }>;
      duration: number;
    };
    return decodeSpeechPayload(data);
  },
  blockedStats: (childId?: number) =>
    request<{ today_count: number; total_count: number }>(
      `/dashboard/blocked/stats${childId != null ? `?child_id=${childId}` : ""}`,
    ),
  blocked: (childId?: number) =>
    request<BlockedAttempt[]>(
      `/dashboard/blocked${childId != null ? `?child_id=${childId}` : ""}`,
    ),
  cloudSettings: (cloud_enabled: boolean, openai_api_key?: string) =>
    request<{ ok: boolean }>("/settings/cloud", {
      method: "POST",
      body: JSON.stringify({ cloud_enabled, openai_api_key }),
    }),
  homeLocation: () =>
    request<{
      location: string | null;
      label: string | null;
      timezone: string | null;
    }>("/settings/home-location"),
  updateHomeLocation: (location: string | null) =>
    request<{
      ok: boolean;
      location: string | null;
      label: string | null;
      timezone: string | null;
    }>("/settings/home-location", {
      method: "POST",
      body: JSON.stringify({ location }),
    }),
  advancedSettings: () =>
    request<{
      default_profile_child_id: number | null;
      classifier_enabled: boolean;
      ai_tone: "warm" | "balanced" | "concise";
      ai_verbosity: number;
      children: Array<{ id: number; name: string; slug: string; has_pin: boolean }>;
    }>("/settings/advanced"),
  updateAdvancedSettings: (data: {
    default_profile_child_id?: number | null;
    classifier_enabled?: boolean;
    ai_tone?: "warm" | "balanced" | "concise";
    ai_verbosity?: number;
  }) =>
    request<{
      ok: boolean;
      default_profile_child_id: number | null;
      classifier_enabled: boolean;
      ai_tone: string;
      ai_verbosity: number;
    }>("/settings/advanced", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  ollamaStatus: () => request<OllamaStatus>("/ollama/status"),
  ollamaRecommendations: () => request<OllamaRecommendation>("/ollama/recommendations"),
  ollamaPull: (model: string) =>
    request<{ ok: boolean; job_id: string; model: string }>("/ollama/pull", {
      method: "POST",
      body: JSON.stringify({ model }),
    }),
  ollamaPullStatus: (jobId: string) => request<OllamaPullJob>(`/ollama/pull/${jobId}`),
  ollamaBootstrap: () =>
    request<{ ok: boolean; ready: boolean; model?: string; job_id?: string }>(
      "/ollama/bootstrap",
      { method: "POST" }
    ),
  ollamaSettings: (chat_model: string, classifier_model?: string) =>
    request<{ ok: boolean; ollama: OllamaStatus }>("/settings/ollama", {
      method: "POST",
      body: JSON.stringify({ chat_model, classifier_model }),
    }),
};

/**
 * Idle is "no bytes at all" — SSE comments/status from the gateway reset this.
 * Do not treat a slow first llama3.2:3b token as a hang if keepalives are flowing.
 */
export const CHAT_STREAM_IDLE_MS = 25_000;
/** Classifier + first token + full reply on llama3.2:3b, with a little slack. */
export const CHAT_STREAM_TOTAL_MS = 120_000;
const RECOVERY_ATTEMPTS = 3;
const RECOVERY_WAIT_MS = 700;

async function recoverCompletedReply(
  sessionId: number,
  userMessage: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RECOVERY_WAIT_MS));
    }
    try {
      const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
        credentials: "include",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { messages?: Array<{ role: string; content: string }> };
      const recovered = latestAssistantAfterUser(data.messages, userMessage);
      if (recovered) return recovered;
    } catch {
      // try again — persist can land a moment after the browser disconnects
    }
  }
  return null;
}

function combineAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((s): s is AbortSignal => Boolean(s));
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export async function streamChat(
  message: string,
  childId: number,
  onToken: (token: string) => void,
  onBlocked: (message: string, tools?: ChatTool[]) => void,
  onDone: () => void,
  sessionId?: number,
  onTools?: (tools: ChatTool[]) => void,
  signal?: AbortSignal,
  quickChat?: boolean,
  onStatus?: (message: string) => void,
): Promise<void> {
  const timeoutAbort = new AbortController();
  const totalTimer = setTimeout(() => timeoutAbort.abort("total-timeout"), CHAT_STREAM_TOTAL_MS);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => timeoutAbort.abort("idle-timeout"), CHAT_STREAM_IDLE_MS);
  };
  resetIdle();

  const combined = combineAbortSignals([signal, timeoutAbort.signal]);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        child_id: childId,
        session_id: sessionId,
        quick_chat: quickChat ?? false,
      }),
      signal: combined,
    });
  } catch (error) {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      if (timeoutAbort.signal.aborted && !signal?.aborted) {
        if (sessionId) {
          const recovered = await recoverCompletedReply(sessionId, message);
          if (recovered) {
            onToken(recovered);
            onDone();
            return;
          }
        }
        throw new Error("Homeward took too long to reply. Please try again.");
      }
      throw error;
    }
    throw error;
  }

  if (!res.ok) {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(parseStreamHttpError(err, res.statusText || CHAT_UNAVAILABLE_MESSAGE));
  }

  const reader = res.body?.getReader();
  if (!reader) {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
    throw new Error("No reader");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  let sawReply = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone();
  };

  try {
    while (true) {
      if (combined.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") {
              sawReply = true;
              onToken(data.content);
            } else if (data.type === "blocked" || data.type === "error") {
              sawReply = true;
              onBlocked(data.message, data.tools);
              if (data.type === "error") finish();
            } else if (data.type === "status") {
              const statusText =
                typeof data.message === "string"
                  ? data.message
                  : typeof data.phase === "string"
                    ? data.phase
                    : "";
              if (statusText) onStatus?.(statusText);
            } else if (data.type === "tools" && Array.isArray(data.tools)) {
              sawReply = true;
              onTools?.(data.tools);
            } else if (data.type === "done") {
              finish();
            }
          } catch {
            // skip malformed
          }
        }
      }
    }
    if (sawReply) {
      finish();
      return;
    }
    if (finished) return;

    const timedOut = timeoutAbort.signal.aborted && !signal?.aborted;
    if (sessionId && (timedOut || !sawReply)) {
      const recovered = await recoverCompletedReply(sessionId, message);
      if (recovered) {
        onToken(recovered);
        finish();
        return;
      }
    }
    if (timedOut || !sawReply) {
      throw new Error("Homeward took too long to reply. Please try again.");
    }
    finish();
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      if (timeoutAbort.signal.aborted && !signal?.aborted) {
        if (!sawReply && sessionId) {
          const recovered = await recoverCompletedReply(sessionId, message);
          if (recovered) {
            onToken(recovered);
            finish();
            return;
          }
        }
        if (sawReply) {
          finish();
          return;
        }
        throw new Error("Homeward took too long to reply. Please try again.");
      }
      finish();
      return;
    }
    throw error;
  } finally {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }
}
