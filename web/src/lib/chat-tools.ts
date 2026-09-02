export type MathTool = { type: "math"; expression: string; result: string; steps?: string[] };
export type TimerTool = { type: "timer"; seconds: number; label: string };
export type ClockTool = { type: "clock"; time: string; date: string; timezone?: string };
export type DefineTool = { type: "define"; word: string; meaning: string; example?: string };
export type QuizQuestion = { q: string; choices: string[]; answer: number; explain?: string };
export type QuizTool = { type: "quiz"; title: string; questions: QuizQuestion[] };
export type FactsTool = { type: "facts"; topic: string; facts: string[] };
export type LookupTool = {
  type: "lookup";
  kind: "weather" | "sports" | "news" | string;
  source: string;
  source_label: string;
  query: string;
  summary: string;
};
export type ChatTool = MathTool | TimerTool | ClockTool | DefineTool | QuizTool | FactsTool | LookupTool;

const TOOL_TYPES = new Set(["math", "timer", "clock", "define", "quiz", "facts", "lookup"]);
const FENCE_RE = /```homeward\s*(\{[\s\S]*?\})\s*```/gi;
const INCOMPLETE_FENCE_RE = /```homeward[\s\S]*$/i;

export function asChatTool(value: unknown): ChatTool | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !TOOL_TYPES.has(type)) return null;
  return value as ChatTool;
}

export function mergeChatTools(existing: ChatTool[] = [], incoming: unknown[] = []): ChatTool[] {
  const next = [...existing];
  for (const item of incoming) {
    const tool = asChatTool(item);
    if (!tool) continue;
    if (!next.some((other) => other.type === tool.type && JSON.stringify(other) === JSON.stringify(tool))) {
      next.push(tool);
    }
  }
  return next;
}

export function extractChatTools(content: string, extra: ChatTool[] = []): { text: string; tools: ChatTool[] } {
  const fromFence: ChatTool[] = [];
  const cleaned = content
    .replace(FENCE_RE, (_, raw: string) => {
      try {
        const parsed = asChatTool(JSON.parse(raw));
        if (parsed) fromFence.push(parsed);
      } catch {
        /* ignore malformed cards */
      }
      return "";
    })
    .replace(INCOMPLETE_FENCE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, tools: mergeChatTools(extra, fromFence) };
}
