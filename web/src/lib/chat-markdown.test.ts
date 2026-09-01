import { describe, expect, it } from "vitest";
import { parseChatMarkdown } from "./chat-markdown";
import { sanitizeForSpeech } from "./speech-voice";

describe("parseChatMarkdown", () => {
  it("parses headings, lists, and bold", () => {
    const blocks = parseChatMarkdown("## Dogs\n\nDogs are **loyal**.\n\n- fetch\n- naps");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
  });
});

describe("sanitizeForSpeech", () => {
  it("strips markdown for read-aloud", () => {
    expect(sanitizeForSpeech("## Dogs\nThey are **loyal**.")).toBe("Dogs They are loyal.");
  });
});
