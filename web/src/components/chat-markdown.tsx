import { parseChatMarkdown, type InlinePart } from "@/lib/chat-markdown";

function Inline({ parts }: { parts: InlinePart[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "bold") return <strong key={i}>{part.text}</strong>;
        if (part.type === "italic") return <em key={i}>{part.text}</em>;
        if (part.type === "code") {
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
              {part.text}
            </code>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

export function ChatMarkdown({ text, simpleMode }: { text: string; simpleMode?: boolean }) {
  const blocks = parseChatMarkdown(text);
  if (!blocks.length) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  return (
    <div className={`space-y-2 ${simpleMode ? "text-base sm:text-lg" : "text-sm"}`}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h3" : "h4";
          return (
            <Tag key={i} className="font-semibold leading-snug">
              <Inline parts={block.parts} />
            </Tag>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={i}
              className={`ml-5 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"}`}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </List>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
              <code>{block.text}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            <Inline parts={block.parts} />
          </p>
        );
      })}
    </div>
  );
}
