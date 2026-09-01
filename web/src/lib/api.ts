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
  age?: number;
  preset_id?: string;
  strictness?: number;
  has_pin?: boolean;
  homework_mode?: boolean;
  allow_resume?: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  quiet_hours_days?: string | null;
  chat_available?: boolean;
  chat_unavailable_message?: string | null;
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
}

export interface OllamaRecommendation {
  system_ram_gb: number;
  ollama_reachable: boolean;
  recommended_model: string;
  models: OllamaModelOption[];
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

export const api = {
  health: () =>
    request<{ status: string; ollama?: { ready: boolean } }>("/health"),
  setupStatus: () => request<SetupStatus>("/setup/status"),
  setup: (password: string) =>
    request<{ ok: boolean; resumed?: boolean; recovery_code?: string }>("/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  completeSetup: () =>
    request<{ ok: boolean }>("/setup/complete", { method: "POST" }),
  login: (password: string) =>
    request<{ ok: boolean; setup_complete: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  resetPassword: (recovery_code: string, new_password: string) =>
    request<{ ok: boolean; recovery_code: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ recovery_code, new_password }),
    }),
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
  resumeSession: (childId: number) =>
    request<ResumableSession>(`/children/${childId}/sessions/resume`),
  verifyPin: (childId: number, pin: string) =>
    request<{ ok: boolean; child_id: number; name: string }>(
      `/children/${childId}/verify-pin`,
      { method: "POST", body: JSON.stringify({ pin }) }
    ),
  chat: (message: string, childId: number, history: Array<{ role: string; content: string }>) =>
    request<{ blocked: boolean; message: string; reason?: string }>("/chat", {
      method: "POST",
      body: JSON.stringify({ message, child_id: childId, history }),
    }),
  logs: () => request<ConversationLog[]>("/dashboard/logs"),
  sessions: () => request<ChatSessionSummary[]>("/dashboard/sessions"),
  sessionMessages: (sessionId: string) =>
    request<ConversationLog[]>(`/dashboard/sessions/${sessionId}/messages`),
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
  blockedStats: () =>
    request<{ today_count: number; total_count: number }>("/dashboard/blocked/stats"),
  blocked: () => request<BlockedAttempt[]>("/dashboard/blocked"),
  devices: () =>
    request<{ devices: unknown[]; message: string }>("/dashboard/devices"),
  cloudSettings: (cloud_enabled: boolean, openai_api_key?: string) =>
    request<{ ok: boolean }>("/settings/cloud", {
      method: "POST",
      body: JSON.stringify({ cloud_enabled, openai_api_key }),
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

export async function streamChat(
  message: string,
  childId: number,
  history: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onBlocked: (message: string) => void,
  onDone: () => void,
  sessionId?: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, child_id: childId, history, session_id: sessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const message =
      typeof detail === "string"
        ? detail
        : "Stream failed";
    throw new Error(message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No reader");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "token") onToken(data.content);
          else if (data.type === "blocked") onBlocked(data.message);
          else if (data.type === "done") onDone();
        } catch {
          // skip malformed
        }
      }
    }
  }
  onDone();
}
