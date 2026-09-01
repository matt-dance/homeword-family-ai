"use client";

import { useState } from "react";
import { parseChatMarkdown, type InlinePart } from "@/lib/chat-markdown";
import { Check, Copy } from "lucide-react";

function Inline({ parts }: { parts: InlinePart[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "bold") {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.text}
            </strong>
          );
        }
        if (part.type === "italic") {
          return (
            <em key={i} className="italic text-foreground/90">
              {part.text}
            </em>
          );
        }
        if (part.type === "code") {
          return (
            <code
              key={i}
              className="rounded-md bg-muted/90 px-1.5 py-0.5 font-mono text-[0.88em] font-medium text-primary border border-border/50"
            >
              {part.text}
            </code>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-2 overflow-hidden rounded-xl border border-border/70 bg-slate-950 text-slate-100 dark:bg-slate-900/90 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-400">
        <span className="font-mono text-[11px]">code</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ChatMarkdown({ text, simpleMode }: { text: string; simpleMode?: boolean }) {
  const blocks = parseChatMarkdown(text);
  if (!blocks.length) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  return (
    <div className={`space-y-3 leading-relaxed ${simpleMode ? "text-base sm:text-lg space-y-4" : "text-sm"}`}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h3" : "h4";
          const headingClass =
            block.level === 1
              ? "text-lg font-bold text-foreground tracking-tight pt-1"
              : "text-base font-semibold text-foreground tracking-tight pt-0.5";
          return (
            <Tag key={i} className={headingClass}>
              <Inline parts={block.parts} />
            </Tag>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={i}
              className={`ml-5 space-y-1.5 ${
                block.ordered
                  ? "list-decimal marker:font-semibold marker:text-primary"
                  : "list-disc marker:text-primary"
              }`}
            >
              {block.items.map((item, j) => (
                <li key={j} className="pl-1 leading-relaxed">
                  <Inline parts={item} />
                </li>
              ))}
            </List>
          );
        }
        if (block.type === "code") {
          return <CodeBlock key={i} code={block.text} />;
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
