import { describe, expect, it } from "vitest";
import { asChatTool, constrainChatTools, extractChatTools, howtoFromProse, mergeChatTools } from "./chat-tools";

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

  it("drops a quiz fence when the route only allows timer", () => {
    const content =
      'Go!\n\n```homeward\n{"type":"quiz","title":"Animal Quiz Time!","questions":[]}\n```\n';
    const extra = [{ type: "timer" as const, seconds: 10, label: "10 seconds" }];
    const { tools } = extractChatTools(content, extra, { allow: ["timer", "lookup"], storyPages: null });
    expect(tools).toEqual(extra);
  });

  it("trims extra story pages to the requested count", () => {
    const story = {
      type: "story" as const,
      title: "Fox",
      pages: [{ text: "One" }, { text: "Two" }, { text: "Three" }],
    };
    const routed = constrainChatTools([story], { allow: ["story"], storyPages: 2 });
    expect(routed[0]).toEqual({ ...story, pages: [{ text: "One" }, { text: "Two" }] });
  });

  it("renders a streamed howto card for the kid UI even without a model fence", () => {
    const extra = {
      type: "howto" as const,
      title: "Make pancakes",
      steps: ["Ask a grown-up to help with the stove.", "Mix flour, milk, and an egg.", "Cook and flip."],
    };
    const { text, tools } = extractChatTools(
      "You can do it!",
      [extra],
      { allow: ["howto", "lookup"], storyPages: null },
    );
    expect(text).toBe("You can do it!");
    expect(tools).toEqual([extra]);
    expect(tools[0]?.type).toBe("howto");
    expect(tools[0] && tools[0].type === "howto" ? tools[0].steps.length : 0).toBeGreaterThanOrEqual(2);
  });

  it("builds an interactive howto card from numbered recipe prose when the route is howto", () => {
    const prose =
      "Sure! Here is a pancake recipe:\n1. Mix flour and milk\n2. Heat the pan\n3. Flip when bubbly\n";
    const { tools } = extractChatTools(prose, [], { allow: ["howto", "lookup"], storyPages: null });
    expect(tools[0]).toMatchObject({
      type: "howto",
      steps: ["Mix flour and milk", "Heat the pan", "Flip when bubbly"],
    });
  });

  it("does not invent a howto card from a numbered list when the route is timer", () => {
    const prose = "Go!\n1. Think of an animal\n2. Count down\n";
    const extra = [{ type: "timer" as const, seconds: 10, label: "10 seconds" }];
    const { tools } = extractChatTools(prose, extra, { allow: ["timer", "lookup"], storyPages: null });
    expect(tools).toEqual(extra);
  });

  it("normalizes nested howto step objects from a fence", () => {
    const content = [
      "```homeward",
      JSON.stringify({
        type: "howto",
        title: "Pancakes",
        steps: [{ text: "Mix flour" }, { instruction: "Cook gently" }],
      }),
      "```",
    ].join("\n");
    const { tools } = extractChatTools(content);
    expect(tools[0]).toEqual({ type: "howto", title: "Pancakes", steps: ["Mix flour", "Cook gently"] });
  });

  it("replaces a generic howto with a richer incoming card", () => {
    const generic = { type: "howto" as const, title: "How to", steps: ["Ask a grown-up.", "Go slowly."] };
    const richer = { type: "howto" as const, title: "Make pancakes", steps: ["Mix", "Cook", "Eat"] };
    expect(mergeChatTools([generic], [richer])).toEqual([richer]);
  });

  it("howtoFromProse needs at least two steps", () => {
    expect(howtoFromProse("Just mix it.")).toBeNull();
    expect(howtoFromProse("1. Only one step")).toBeNull();
  });
});
