/** Kid-safe markdown: render structure, never HTML. */

export type InlinePart = { type: "text" | "bold" | "italic" | "code"; text: string };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; parts: InlinePart[] }
  | { type: "paragraph"; parts: InlinePart[] }
  | { type: "list"; ordered: boolean; items: InlinePart[][] }
  | { type: "code"; text: string };

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      parts.push({ type: "text", text: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push({ type: "bold", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      parts.push({ type: "code", text: token.slice(1, -1) });
    } else {
      parts.push({ type: "italic", text: token.slice(1, -1) });
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push({ type: "text", text: text.slice(last) });
  }
  return parts.length ? parts : [{ type: "text", text }];
}

export function parseChatMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        parts: parseInline(heading[2]),
      });
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items: InlinePart[][] = [];
      while (i < lines.length) {
        const b = /^\s*[-*+]\s+(.+)$/.exec(lines[i]);
        const n = /^\s*\d+\.\s+(.+)$/.exec(lines[i]);
        if (ordered ? n : b) {
          items.push(parseInline((ordered ? n : b)![1]));
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", parts: parseInline(para.join(" ")) });
  }

  return blocks;
}
