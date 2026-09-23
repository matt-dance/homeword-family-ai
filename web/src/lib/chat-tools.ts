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
    const heading = line.match(HOWTO_HEADING_RE);
    if (heading && foundTitle === "How to") {
      foundTitle = heading[1].trim();
      continue;
    }
    const match = line.match(HOWTO_STEP_RE);
    if (match) {
      const step = match[1].replace(/\*\*/g, "").trim();
      if (step) steps.push(step);
    }
  }
  if (steps.length < 2) return null;
  return { type: "howto", title: foundTitle || "How to", steps };
}

function factItemText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (value && typeof value === "object") {
    for (const key of ["text", "fact", "body", "content"] as const) {
      const raw = (value as Record<string, unknown>)[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return null;
}

function factsToolFromObject(value: unknown): FactsTool | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.type != null && obj.type !== "facts") return null;
  const rawTopic = typeof obj.topic === "string" && obj.topic.trim() ? obj.topic : obj.title;
  const topic = typeof rawTopic === "string" && rawTopic.trim() ? rawTopic.trim() : "Fun Facts";
  const rawFacts = obj.facts ?? obj.items;
  const facts: string[] = [];
  if (Array.isArray(rawFacts)) {
    for (const item of rawFacts) {
      const fact = factItemText(item);
      if (fact) facts.push(fact);
    }
  } else if (typeof rawFacts === "string") {
    for (const line of rawFacts.split(/\r?\n/)) {
      const fact = factItemText(line.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, ""));
      if (fact) facts.push(fact);
    }
  }
  if (!facts.length) return null;
  return { type: "facts", topic, facts };
}

export function normalizeFactsTool(value: unknown): FactsTool | null {
  if (!value || typeof value !== "object") return null;
  if ((value as { type?: unknown }).type !== "facts") return null;
  return factsToolFromObject(value);
}

export function factsToProse(tool: FactsTool): string {
  return tool.facts.map((fact) => fact.trim()).filter(Boolean).join(" ");
}

function isJsQuoteCloser(source: string, index: number, quote: string): boolean {
  if (source[index] !== quote) return false;
  // Close only before JSON structure. That keeps possessives (dog's, animals' homes)
  // and unescaped inner quotes (a "flamboyance") inside the string instead of
  // making a finished Facts payload look incomplete and disappear.
  let next = index + 1;
  while (next < source.length && /\s/.test(source[next])) next += 1;
  const char = source[next] ?? "";
  return char === "" || char === "," || char === "]" || char === "}" || char === ":";
}

function extractBalancedJson(source: string, start: number): { raw: string; end: number } | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let quote: string | null = null;
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (isJsQuoteCloser(source, i, quote)) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return { raw: source.slice(start, i + 1), end: i + 1 };
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
    const extracted = extractBalancedJson(content, jsonStart);
    if (!extracted) continue;
    const { raw, end: jsonEnd } = extracted;
    const close = content.indexOf("```", jsonEnd);
    const end = close >= 0 ? close + 3 : jsonEnd;
    const tool = toolFromFencePayload(raw);
    if (tool) tools.push(tool);
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
  }

  cleaned = stripIncompleteFence(cleaned).replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, tools };
}

function toolFromFencePayload(raw: string): ChatTool | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = parseLooseRecord(raw);
  }
  const tool = parsed ? asChatTool(parsed) : null;
  if (tool) return tool;
  return parsed ? factsToolFromObject(parsed) : null;
}

function isFenceJsonLine(line: string): boolean {
  if (/[{}\[\]`]/.test(line) || !/[A-Za-z]/.test(line)) return true;
  const trimmed = line.trim();
  if (/^["']/.test(trimmed)) return true;
  return /^[A-Za-z0-9_]+\s*:/.test(trimmed) && /["']/.test(trimmed);
}

function stripIncompleteFence(content: string): string {
  const match = /```homeward/i.exec(content);
  if (!match || match.index == null) return content;
  const head = content.slice(0, match.index).trim();
  const lines = content.slice(match.index).split("\n");
  const prose: string[] = [];
  while (lines.length > 1) {
    const last = lines[lines.length - 1];
    if (isFenceJsonLine(last)) break;
    prose.unshift(lines.pop() as string);
  }
  return [head, prose.join("\n").trim()].filter(Boolean).join("\n\n");
}

const PLACEHOLDER_FACT_RE = /^(?:\.{1,3}|type|facts|topic|items)$/i;

function closedQuotedStrings(source: string): string[] {
  const found: string[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const quote = source[i];
    if (quote !== '"' && quote !== "'") continue;
    let j = i + 1;
    let buf = "";
    let closed = false;
    while (j < source.length) {
      if (source[j] === "\\" && j + 1 < source.length) {
        buf += source[j + 1];
        j += 2;
        continue;
      }
      if (isJsQuoteCloser(source, j, quote)) {
        closed = true;
        j += 1;
        break;
      }
      buf += source[j];
      j += 1;
    }
    if (closed) {
      const text = buf.trim();
      if (text) found.push(text);
      i = j - 1;
    }
  }
  return found;
}

function looseTopic(content: string): string | null {
  const match = content.match(/\btopic\b\s*"?\s*:/i);
  if (!match || match.index == null) return null;
  const rest = content.slice(match.index + match[0].length).trimStart();
  if (rest.startsWith('"') || rest.startsWith("'")) {
    const quoted = closedQuotedStrings(rest)[0];
    return quoted && !PLACEHOLDER_FACT_RE.test(quoted) ? quoted : null;
  }
  const bare = rest.match(/^[A-Za-z0-9][^,}\]]*/);
  const topic = bare?.[0]?.trim();
  return topic || null;
}

function salvageFactsTool(content: string): FactsTool | null {
  const key = content.search(/\bfacts\b\s*"?\s*:/i);
  if (key < 0) return null;
  const after = content.slice(key);
  const colon = after.indexOf(":");
  const bracket = after.indexOf("[");
  const region = bracket >= 0 ? after.slice(bracket) : after.slice(colon + 1);
  const facts = closedQuotedStrings(region).filter((fact) => !PLACEHOLDER_FACT_RE.test(fact));
  if (!facts.length) return null;
  return { type: "facts", topic: looseTopic(content) || "Fun Facts", facts };
}

type JsCursor = { s: string; i: number };

function skipJsWs(p: JsCursor) {
  while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i += 1;
}

function readJsString(p: JsCursor): string {
  const quote = p.s[p.i];
  p.i += 1;
  let out = "";
  while (p.i < p.s.length) {
    const ch = p.s[p.i];
    if (ch === "\\") {
      const next = p.s[p.i + 1];
      if (!next) break;
      const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "\\": "\\" };
      out += map[next] ?? next;
      p.i += 2;
      continue;
    }
    if (isJsQuoteCloser(p.s, p.i, quote)) {
      p.i += 1;
      return out;
    }
    out += ch;
    p.i += 1;
  }
  throw new Error("unterminated string");
}

function readJsIdent(p: JsCursor): string {
  skipJsWs(p);
  const start = p.i;
  if (!/[A-Za-z_]/.test(p.s[p.i] || "")) throw new Error("ident");
  p.i += 1;
  while (p.i < p.s.length && /[A-Za-z0-9_]/.test(p.s[p.i])) p.i += 1;
  return p.s.slice(start, p.i);
}

function readJsValue(p: JsCursor): unknown {
  skipJsWs(p);
  const ch = p.s[p.i];
  if (ch === '"' || ch === "'") return readJsString(p);
  if (ch === "{") return readJsObject(p);
  if (ch === "[") return readJsArray(p);
  if (ch === "-" || (ch >= "0" && ch <= "9")) {
    const start = p.i;
    if (ch === "-") p.i += 1;
    while (p.i < p.s.length && /[0-9.eE+-]/.test(p.s[p.i])) p.i += 1;
    const num = Number(p.s.slice(start, p.i));
    if (Number.isNaN(num)) throw new Error("bad number");
    return num;
  }
  const ident = readJsIdent(p);
  if (ident === "true") return true;
  if (ident === "false") return false;
  if (ident === "null") return null;
  const words = [ident];
  while (p.i < p.s.length) {
    const save = p.i;
    skipJsWs(p);
    if (p.i < p.s.length && /[A-Za-z_]/.test(p.s[p.i])) {
      words.push(readJsIdent(p));
      continue;
    }
    p.i = save;
    break;
  }
  return words.join(" ");
}

function readJsObject(p: JsCursor): Record<string, unknown> {
  if (p.s[p.i] !== "{") throw new Error("object");
  p.i += 1;
  const obj: Record<string, unknown> = {};
  skipJsWs(p);
  if (p.s[p.i] === "}") {
    p.i += 1;
    return obj;
  }
  while (p.i < p.s.length) {
    skipJsWs(p);
    const key = p.s[p.i] === '"' || p.s[p.i] === "'" ? readJsString(p) : readJsIdent(p);
    skipJsWs(p);
    if (p.s[p.i] !== ":") throw new Error("colon");
    p.i += 1;
    obj[key] = readJsValue(p);
    skipJsWs(p);
    if (p.s[p.i] === ",") {
      p.i += 1;
      skipJsWs(p);
      if (p.s[p.i] === "}") {
        p.i += 1;
        return obj;
      }
      continue;
    }
    if (p.s[p.i] === "}") {
      p.i += 1;
      return obj;
    }
    throw new Error("object end");
  }
  throw new Error("unterminated object");
}

function readJsArray(p: JsCursor): unknown[] {
  if (p.s[p.i] !== "[") throw new Error("array");
  p.i += 1;
  const arr: unknown[] = [];
  skipJsWs(p);
  if (p.s[p.i] === "]") {
    p.i += 1;
    return arr;
  }
  while (p.i < p.s.length) {
    arr.push(readJsValue(p));
    skipJsWs(p);
    if (p.s[p.i] === ",") {
      p.i += 1;
      skipJsWs(p);
      if (p.s[p.i] === "]") {
        p.i += 1;
        return arr;
      }
      continue;
    }
    if (p.s[p.i] === "]") {
      p.i += 1;
      return arr;
    }
    throw new Error("array end");
  }
  throw new Error("unterminated array");
}

function parseLooseRecord(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* tiny models echo JS-style objects instead of JSON */
  }
  try {
    const parsed = readJsValue({ s: trimmed, i: 0 });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function leadingFactsPrefix(content: string, brace: number): number | null {
  const match = content.slice(0, brace).match(/\b[Ff]acts\s*$/);
  return match && match.index != null ? match.index : null;
}

function looksLikeFactsStart(content: string, brace: number): boolean {
  if (leadingFactsPrefix(content, brace) != null) return true;
  const peek = content.slice(brace, brace + 96);
  if (/"type"\s*:\s*"facts"/.test(peek)) return true;
  return /\btopic\s*:/.test(peek) && /\bfacts\s*:/.test(peek);
}

function pullFactsPayloads(content: string): { cleaned: string; tools: FactsTool[] } {
  const tools: FactsTool[] = [];
  const ranges: Array<[number, number]> = [];
  let hideFrom = content.length;
  let cursor = 0;

  while (cursor < hideFrom) {
    const brace = content.indexOf("{", cursor);
    if (brace < 0 || brace >= hideFrom) break;
    const extracted = extractBalancedJson(content, brace);
    if (!extracted) {
      if (looksLikeFactsStart(content, brace)) {
        hideFrom = Math.min(hideFrom, leadingFactsPrefix(content, brace) ?? brace);
      }
      break;
    }
    const parsed = parseLooseRecord(extracted.raw);
    const tool = parsed ? factsToolFromObject(parsed) : null;
    if (!tool) {
      cursor = brace + 1;
      continue;
    }
    const start = leadingFactsPrefix(content, brace) ?? brace;
    ranges.push([start, extracted.end]);
    tools.push(tool);
    cursor = extracted.end;
  }

  let cleaned = "";
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start >= hideFrom) break;
    cleaned += content.slice(pos, start);
    pos = end;
  }
  cleaned += content.slice(pos, hideFrom);
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, tools };
}

export function asChatTool(value: unknown): ChatTool | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !TOOL_TYPES.has(type)) return null;
  if (type === "howto") return normalizeHowToTool(value);
  if (type === "facts") return normalizeFactsTool(value);
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
  const { cleaned: afterFence, tools: fromFence } = pullFencedTools(content);
  const { cleaned: afterFacts, tools: fromFacts } = pullFactsPayloads(afterFence);
  let tools = constrainChatTools(mergeChatTools(extra, [...fromFence, ...fromFacts]), route);
  const routeAllowsHowto = Boolean(route?.allow?.includes("howto"));
  if (routeAllowsHowto && !tools.some((tool) => tool.type === "howto")) {
    const synthesized = howtoFromProse(afterFacts);
    if (synthesized) {
      tools = constrainChatTools([...tools, synthesized], route);
    }
  }
  let text = afterFacts;
  const routeAllowsFacts = !route?.allow || route.allow.includes("facts");
  if (!routeAllowsFacts && fromFacts.length) {
    const prose = fromFacts.map(factsToProse).filter(Boolean).join(" ");
    if (prose) {
      text = [afterFacts, prose].filter((part) => part.trim()).join("\n\n").trim();
    }
  }
  if (
    !text.trim() &&
    fromFence.length === 0 &&
    fromFacts.length === 0 &&
    !tools.some((tool) => tool.type === "facts")
  ) {
    const salvaged = salvageFactsTool(content);
    if (salvaged) {
      if (routeAllowsFacts) {
        tools = constrainChatTools(mergeChatTools(tools, [salvaged]), route);
      } else {
        const prose = factsToProse(salvaged);
        if (prose) text = prose;
      }
    }
  }
  return { text, tools };
}
