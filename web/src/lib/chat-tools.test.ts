import { describe, expect, it } from "vitest";
import { asChatTool, extractChatTools, mergeChatTools } from "./chat-tools";

describe("extractChatTools", () => {
  it("strips a complete homeward fence and parses the card", () => {
    const content =
      'Here you go.\n\n```homeward\n{"type":"facts","topic":"dogs","facts":["They sniff.","They run."]}\n```\n';
    const { text, tools } = extractChatTools(content);
    expect(text).toBe("Here you go.");
    expect(tools).toEqual([
      { type: "facts", topic: "dogs", facts: ["They sniff.", "They run."] },
    ]);
  });

  it("hides an incomplete fence while streaming", () => {
    const { text, tools } = extractChatTools('Almost ready\n```homeward\n{"type":"define","word":"atom"');
    expect(text).toBe("Almost ready");
    expect(tools).toEqual([]);
  });

  it("merges extra streamed tools without duplicates", () => {
    const extra = [{ type: "timer" as const, seconds: 120, label: "2 minutes" }];
    const { tools } = extractChatTools("", extra);
    expect(mergeChatTools(tools, extra)).toEqual(extra);
  });

  it("ignores unknown tool types", () => {
    expect(asChatTool({ type: "calendar" })).toBeNull();
    const { tools } = extractChatTools('```homeward\n{"type":"calendar"}\n```');
    expect(tools).toEqual([]);
  });

  it("accepts a named-source lookup card", () => {
    const lookup = {
      type: "lookup" as const,
      kind: "weather",
      source: "open-meteo",
      source_label: "Open-Meteo weather",
      query: "Denver",
      summary: "Denver — 70°F, clear skies",
    };
    expect(asChatTool(lookup)).toEqual(lookup);
    const { tools } = extractChatTools("", [lookup]);
    expect(tools).toEqual([lookup]);
  });
});
