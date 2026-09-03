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
    const { tools } = extractChatTools("", [lookup]);
    expect(tools).toEqual([lookup]);
  });

  it("accepts a clock card", () => {
    const clock = {
      type: "clock",
      time: "8:29 PM",
      date: "Tuesday, September 1, 2026",
      timezone: "MDT",
    };
    expect(asChatTool(clock)?.type).toBe("clock");
  });

  it("accepts story, riddle, convert, practice, ask_parent, and howto cards", () => {
    const story = {
      type: "story",
      title: "Moon hike",
      pages: [{ text: "You land.", choices: [{ label: "Wave", message: "I wave." }] }],
    };
    const riddle = { type: "riddle", riddle: "What has hands but no arms?", answer: "A clock" };
    const convert = {
      type: "convert",
      from_amount: "5",
      from_unit: "feet",
      to_unit: "inches",
      result: "60",
    };
    const practice = {
      type: "practice",
      title: "Twos",
      kind: "times",
      items: [{ prompt: "2 × 3", answer: "6" }],
    };
    const askParent = { type: "ask_parent", title: "Ask a grown-up", message: "Let's ask a parent." };
    const howto = { type: "howto", title: "Toast", steps: ["Get bread", "Toast it"] };

    expect(asChatTool(story)?.type).toBe("story");
    expect(asChatTool(riddle)?.type).toBe("riddle");
    expect(asChatTool(convert)?.type).toBe("convert");
    expect(asChatTool(practice)?.type).toBe("practice");
    expect(asChatTool(askParent)?.type).toBe("ask_parent");
    expect(asChatTool(howto)?.type).toBe("howto");

    const fenced = [
      '```homeward',
      JSON.stringify(story),
      "```",
    ].join("\n");
    expect(extractChatTools(fenced).tools[0]).toEqual(story);
  });
});
