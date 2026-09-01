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
}

export interface SetupStatus {
  setup_complete: boolean;
  has_parent: boolean;
}

export interface ConversationLog {
  id: number;
  child_id: number;
  direction: string;
  content: string;
  blocked: boolean;
  block_reason: string | null;
  created_at: string;
}

export interface BlockedAttempt {
  id: number;
  child_id: number;
  content: string;
  reason: string;
  stage: string;
  created_at: string;
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
  health: () => request<{ status: string }>("/health"),
  setupStatus: () => request<SetupStatus>("/setup/status"),
  setup: (password: string) =>
    request<{ ok: boolean; resumed?: boolean }>("/setup", {
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
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () =>
    request<{ parent_id: number; setup_complete: boolean; cloud_enabled: boolean }>(
      "/auth/me"
    ),
  presets: () => request<Preset[]>("/presets"),
  children: () => request<Child[]>("/children"),
  childrenPublic: () => request<Child[]>("/children/public"),
  createChild: (data: {
    name: string;
    age: number;
    preset_id?: string;
    strictness: number;
    pin?: string;
  }) =>
    request<Child>("/children", {
      method: "POST",
      body: JSON.stringify(data),
    }),
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
  blocked: () => request<BlockedAttempt[]>("/dashboard/blocked"),
  devices: () =>
    request<{ devices: unknown[]; message: string }>("/dashboard/devices"),
  cloudSettings: (cloud_enabled: boolean, openai_api_key?: string) =>
    request<{ ok: boolean }>("/settings/cloud", {
      method: "POST",
      body: JSON.stringify({ cloud_enabled, openai_api_key }),
    }),
};

export async function streamChat(
  message: string,
  childId: number,
  history: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onBlocked: (message: string) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, child_id: childId, history }),
  });

  if (!res.ok) throw new Error("Stream failed");

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
