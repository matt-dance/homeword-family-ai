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
export type StoryChoice = { label: string; message: string };
export type StoryPage = { text: string; choices?: StoryChoice[] };
export type StoryTool = { type: "story"; title: string; pages: StoryPage[] };
export type RiddleTool = { type: "riddle"; riddle: string; answer: string; hint?: string };
export type ConvertTool = {
  type: "convert";
  from_amount: string;
  from_unit: string;
  to_unit: string;
  result: string;
};
export type PracticeItem = { prompt: string; answer: string };
export type PracticeTool = {
  type: "practice";
  title: string;
  kind?: "spelling" | "times" | string;
  items: PracticeItem[];
};
export type AskParentTool = { type: "ask_parent"; title: string; message: string; reason?: string };
export type HowToTool = { type: "howto"; title: string; steps: string[] };
export type ChatTool =
  | MathTool
  | TimerTool
  | ClockTool
  | DefineTool
  | QuizTool
  | FactsTool
  | LookupTool
  | StoryTool
  | RiddleTool
  | ConvertTool
  | PracticeTool
  | AskParentTool
  | HowToTool;

const TOOL_TYPES = new Set([
  "math",
  "timer",
  "clock",
  "define",
  "quiz",
  "facts",
  "lookup",
  "story",
  "riddle",
  "convert",
  "practice",
  "ask_parent",
  "howto",
]);
const FENCE_OPEN_RE = /```homeward\s*/gi;
const FENCE_RE = /```homeward\s*(\{[\s\S]*?\})\s*```/gi;
const INCOMPLETE_FENCE_RE = /```homeward[\s\S]*$/i;
const HOWTO_STEP_RE = /^\s*(?:\d+[.)]\s+|[-*•]\s+)(.+)$/;
const HOWTO_HEADING_RE = /^\s*#{1,3}\s+(.+)$/;

function howtoStepText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.replace(/^\s*\d+[.)]\s*/, "").trim();
    return text || null;
  }
  if (value && typeof value === "object") {
    for (const key of ["text", "step", "instruction", "title", "label"] as const) {
      const raw = (value as Record<string, unknown>)[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return null;
}

export function normalizeHowToTool(value: unknown): HowToTool | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { type?: unknown; title?: unknown; name?: unknown; steps?: unknown; instructions?: unknown };
  if (obj.type !== "howto") return null;
  const rawTitle = typeof obj.title === "string" && obj.title.trim() ? obj.title : obj.name;
  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : "How to";
  const rawSteps = obj.steps ?? obj.instructions;
  const steps: string[] = [];
  if (Array.isArray(rawSteps)) {
    for (const item of rawSteps) {
      const step = howtoStepText(item);
      if (step) steps.push(step);
    }
  } else if (typeof rawSteps === "string") {
    for (const line of rawSteps.split(/\r?\n/)) {
      const step = howtoStepText(line);
      if (step) steps.push(step);
    }
  }
  if (!steps.length) return null;
  return { type: "howto", title, steps };
}

export function howtoFromProse(content: string, title = "How to"): HowToTool | null {
  const steps: string[] = [];
  let foundTitle = title;
  for (const line of content.split(/\r?\n/)) {
    const heading = HOWTO_HEADING_RE.exec(line);
    if (heading && foundTitle === "How to") {
      foundTitle = heading[1].trim();
      continue;
    }
    const match = HOWTO_STEP_RE.exec(line);
    if (match) {
      const step = match[1].replace(/\*\*/g, "").trim();
      if (step) steps.push(step);
    }
  }
  if (steps.length < 2) return null;
  return { type: "howto", title: foundTitle || "How to", steps };
}

function extractBalancedJson(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function pullFencedTools(content: string): { cleaned: string; tools: ChatTool[] } {
  const tools: ChatTool[] = [];
  const ranges: Array<[number, number]> = [];
  FENCE_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_OPEN_RE.exec(content))) {
    const jsonStart = content.indexOf("{", match.index + match[0].length);
    if (jsonStart < 0) continue;
    const raw = extractBalancedJson(content, jsonStart);
    if (!raw) continue;
    const close = content.indexOf("```", jsonStart + raw.length);
    const end = close >= 0 ? close + 3 : jsonStart + raw.length;
    try {
      const parsed = asChatTool(JSON.parse(raw));
      if (parsed) tools.push(parsed);
    } catch {
      /* ignore malformed cards */
    }
    ranges.push([match.index, end]);
    FENCE_OPEN_RE.lastIndex = end;
  }

  let cleaned = content;
  if (ranges.length) {
    cleaned = "";
    let cursor = 0;
    for (const [start, end] of ranges) {
      cleaned += content.slice(cursor, start);
      cursor = end;
    }
    cleaned += content.slice(cursor);
  } else {
    cleaned = content.replace(FENCE_RE, (_, raw: string) => {
      try {
        const parsed = asChatTool(JSON.parse(raw));
        if (parsed) tools.push(parsed);
      } catch {
        /* ignore malformed cards */
      }
      return "";
    });
  }

  cleaned = cleaned.replace(INCOMPLETE_FENCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, tools };
}

export function asChatTool(value: unknown): ChatTool | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !TOOL_TYPES.has(type)) return null;
  if (type === "howto") return normalizeHowToTool(value);
  return value as ChatTool;
}

export type CardRoute = {
  allow: string[] | null;
  storyPages: number | null;
};

export function mergeChatTools(existing: ChatTool[] = [], incoming: unknown[] = []): ChatTool[] {
  const next = [...existing];
  for (const item of incoming) {
    const tool = asChatTool(item);
    if (!tool) continue;
    if (tool.type === "howto") {
      const index = next.findIndex((other) => other.type === "howto");
      if (index >= 0) {
        next[index] = tool;
        continue;
      }
    }
    if (!next.some((other) => other.type === tool.type && JSON.stringify(other) === JSON.stringify(tool))) {
      next.push(tool);
    }
  }
  return next;
}

function trimStoryPages(tool: ChatTool, storyPages: number | null): ChatTool {
  if (tool.type !== "story" || !storyPages || !Array.isArray(tool.pages)) return tool;
  if (tool.pages.length <= storyPages) return tool;
  return { ...tool, pages: tool.pages.slice(0, storyPages) };
}

export function constrainChatTools(tools: ChatTool[], route: CardRoute | null | undefined): ChatTool[] {
  if (!route) return tools;
  const allow = route.allow;
  const next = allow
    ? tools.filter((tool) => allow.includes(tool.type))
    : tools;
  return next.map((tool) => trimStoryPages(tool, route.storyPages));
}

export function extractChatTools(
  content: string,
  extra: ChatTool[] = [],
  route?: CardRoute | null,
): { text: string; tools: ChatTool[] } {
  const { cleaned, tools: fromFence } = pullFencedTools(content);
  let tools = constrainChatTools(mergeChatTools(extra, fromFence), route);
  const routeAllowsHowto = Boolean(route?.allow?.includes("howto"));
  if (routeAllowsHowto && !tools.some((tool) => tool.type === "howto")) {
    const synthesized = howtoFromProse(cleaned);
    if (synthesized) {
      tools = constrainChatTools([...tools, synthesized], route);
    }
  }
  return { text: cleaned, tools };
}
