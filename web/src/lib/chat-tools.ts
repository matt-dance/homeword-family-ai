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

const FACT_ITEM_KEYS = [
  "text",
  "fact",
  "body",
  "content",
  "description",
  "info",
  "value",
  "summary",
  "detail",
] as const;
const FACT_LIST_KEYS = ["facts", "items", "list", "entries"] as const;
const FACT_META_KEYS = new Set(["type", "topic", "title"]);
const FACT_META_VALUES = new Set(["facts", "type", "topic", "title", "items", "fun facts"]);
const FACTS_TOPIC_FIELD_RE = /\btopic\s*:\s*(?:["']([^"'\n]+)["']|([A-Za-z][A-Za-z0-9 \-']*))/i;
export const FACTS_EMPTY_FALLBACK = "I got mixed up telling those fun facts. Ask me again!";

function looksLikeFactText(value: string): boolean {
  const text = value.trim();
  if (!text || FACT_META_VALUES.has(text.toLowerCase())) return false;
  if (/^(type|topic|title|facts|items|word|meaning)\b/i.test(text)) return false;
  if (!text.includes(" ")) return false;
  return text.length >= 12;
}

function factItemText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of FACT_ITEM_KEYS) {
      const raw = obj[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
    for (const raw of Object.values(obj)) {
      if (typeof raw === "string" && looksLikeFactText(raw)) return raw.trim();
    }
  }
  return null;
}

function collectFactTexts(raw: unknown): string[] {
  const facts: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const fact = factItemText(item);
      if (fact) facts.push(fact);
    }
    return facts;
  }
  if (raw && typeof raw === "object") {
    for (const item of Object.values(raw as Record<string, unknown>)) {
      if (item && typeof item === "object") {
        facts.push(...collectFactTexts(item));
      } else {
        const fact = factItemText(item);
        if (fact) facts.push(fact);
      }
    }
    return facts;
  }
  if (typeof raw === "string") {
    for (const line of raw.split(/\r?\n/)) {
      const fact = factItemText(line.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, ""));
      if (fact) facts.push(fact);
    }
    if (!facts.length && raw.trim()) facts.push(raw.trim());
  }
  return facts;
}

function factsToolFromObject(value: unknown): FactsTool | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.type != null && obj.type !== "facts") return null;
  const rawTopic = typeof obj.topic === "string" && obj.topic.trim() ? obj.topic : obj.title;
  const topic = typeof rawTopic === "string" && rawTopic.trim() ? rawTopic.trim() : "Fun Facts";
  let facts: string[] = [];
  for (const key of FACT_LIST_KEYS) {
    if (obj[key] != null) {
      facts = collectFactTexts(obj[key]);
      break;
    }
  }
  if (!facts.length) {
    for (const [key, item] of Object.entries(obj)) {
      if (FACT_META_KEYS.has(key) || (FACT_LIST_KEYS as readonly string[]).includes(key)) continue;
      facts.push(...collectFactTexts(item));
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

export function factsFromProse(content: string, title = "Fun Facts"): FactsTool | null {
  const facts: string[] = [];
  let foundTitle = title;
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(HOWTO_HEADING_RE);
    if (heading && foundTitle === "Fun Facts") {
      foundTitle = heading[1].trim();
      continue;
    }
    const match = line.match(HOWTO_STEP_RE);
    if (match) {
      const fact = match[1].replace(/\*\*/g, "").trim();
      if (fact) facts.push(fact);
    }
  }
  if (facts.length < 2) return null;
  return { type: "facts", topic: foundTitle || "Fun Facts", facts };
}

function topicFromFactsText(text: string): string | null {
  const match = text.match(FACTS_TOPIC_FIELD_RE);
  const topic = (match?.[1] || match?.[2] || "").trim();
  return topic || null;
}

function completedQuotedStrings(text: string): string[] {
  const strings: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      const cursor: JsCursor = { s: text, i: index };
      try {
        strings.push(readJsString(cursor));
        index = cursor.i;
        continue;
      } catch {
        break;
      }
    }
    index += 1;
  }
  return strings;
}

function numberedFactLines(text: string): string[] {
  const facts: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(HOWTO_STEP_RE);
    if (!match) continue;
    const fact = match[1].replace(/\*\*/g, "").trim();
    if (fact) facts.push(fact);
  }
  return facts;
}

function scaffoldStrippedFacts(text: string): string[] {
  const cleaned = text
    .replace(/```homeward/gi, " ")
    .replace(/(^|[\n{,])\s*Facts\b/gi, "$1 ")
    .replace(/["'`]+/g, " ")
    .replace(/\b(?:type|topic|title|facts|items)\s*:/gi, " ")
    .replace(/[{}\[\],]/g, "\n");
  const facts: string[] = [];
  for (const line of cleaned.split(/\r?\n/)) {
    const item = line.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, "").replace(/\s+/g, " ").trim();
    if (looksLikeFactText(item)) facts.push(item);
  }
  return facts;
}

export function salvageFactsTool(text: string, topic?: string, opts?: { allowScaffold?: boolean }): FactsTool | null {
  const foundTopic = topic?.trim() || topicFromFactsText(text) || "Fun Facts";
  let facts = numberedFactLines(text);
  if (!facts.length) {
    for (const item of completedQuotedStrings(text)) {
      if (item.trim() === foundTopic || !looksLikeFactText(item)) continue;
      facts.push(item.trim());
    }
  }
  if (!facts.length && opts?.allowScaffold) {
    facts = scaffoldStrippedFacts(text).filter((item) => item !== foundTopic);
  }
  if (!facts.length) return null;
  return { type: "facts", topic: foundTopic, facts };
}

function looksLikeFactsObject(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  if (value.type === "facts") return true;
  return value.topic != null || value.facts != null || value.items != null;
}

function isJsQuoteCloser(source: string, index: number, quote: string): boolean {
  if (source[index] !== quote) return false;
  // Tiny models leave possessives and inner quotes unescaped.
  if ((quote === "'" || quote === '"') && /[A-Za-z]/.test(source[index + 1] ?? "")) return false;
  return true;
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
  let strippedEmptyFacts = false;
  FENCE_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_OPEN_RE.exec(content))) {
    const jsonStart = content.indexOf("{", match.index + match[0].length);
    if (jsonStart < 0) break;
    const extracted = extractBalancedJson(content, jsonStart);
    if (!extracted) {
      if (looksLikeFactsStart(content, jsonStart)) {
        const salvaged = salvageFactsTool(content.slice(match.index));
        if (salvaged) {
          tools.push(salvaged);
          ranges.push([match.index, content.length]);
        }
      }
      break;
    }
    const { raw, end: jsonEnd } = extracted;
    const close = content.indexOf("```", jsonEnd);
    const end = close >= 0 ? close + 3 : jsonEnd;
    const parsed = parseLooseRecord(raw);
    const tool =
      (parsed ? asChatTool(parsed) : null) ??
      (parsed ? factsToolFromObject(parsed) : null) ??
      (parsed && looksLikeFactsObject(parsed) ? salvageFactsTool(raw, undefined, { allowScaffold: true }) : null);
    if (tool) tools.push(tool);
    else if (parsed && looksLikeFactsObject(parsed)) strippedEmptyFacts = true;
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

  const incomplete = cleaned.match(INCOMPLETE_FENCE_RE);
  if (incomplete) {
    const brace = incomplete[0].indexOf("{");
    if (
      !tools.some((tool) => tool.type === "facts") &&
      brace >= 0 &&
      looksLikeFactsStart(incomplete[0], brace)
    ) {
      const salvaged = salvageFactsTool(incomplete[0]);
      if (salvaged) tools.push(salvaged);
    }
    cleaned = cleaned.slice(0, incomplete.index);
  }
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned && !tools.length && strippedEmptyFacts) {
    cleaned = FACTS_EMPTY_FALLBACK;
  }
  return { cleaned, tools };
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
  throw new Error("unexpected ident");
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
  let strippedFacts = false;
  let cursor = 0;

  while (cursor < hideFrom) {
    const brace = content.indexOf("{", cursor);
    if (brace < 0 || brace >= hideFrom) break;
    const extracted = extractBalancedJson(content, brace);
    if (!extracted) {
      if (looksLikeFactsStart(content, brace)) {
        const start = leadingFactsPrefix(content, brace) ?? brace;
        const salvaged = salvageFactsTool(content.slice(start));
        if (salvaged) {
          tools.push(salvaged);
          ranges.push([start, content.length]);
          strippedFacts = true;
          break;
        }
        hideFrom = Math.min(hideFrom, start);
      }
      break;
    }
    const parsed = parseLooseRecord(extracted.raw);
    let tool = parsed ? factsToolFromObject(parsed) : null;
    if (!tool && looksLikeFactsStart(content, brace)) {
      const start = leadingFactsPrefix(content, brace) ?? brace;
      tool = salvageFactsTool(content.slice(start, extracted.end), undefined, { allowScaffold: true });
      if (!tool) {
        ranges.push([start, extracted.end]);
        strippedFacts = true;
        cursor = extracted.end;
        continue;
      }
    }
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
  if (!cleaned && !tools.length && strippedFacts && hideFrom === content.length) {
    cleaned = FACTS_EMPTY_FALLBACK;
  }
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
  complete = false,
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
  const routeAsksFacts = Boolean(route?.allow?.includes("facts"));
  if (routeAsksFacts && !tools.some((tool) => tool.type === "facts")) {
    const synthesized = factsFromProse(afterFacts);
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
    complete &&
    !text.trim() &&
    !tools.length &&
    /\bFacts\b|```homeward/i.test(content)
  ) {
    text = FACTS_EMPTY_FALLBACK;
  }
  return { text, tools };
}
