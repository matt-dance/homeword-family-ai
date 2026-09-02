import { describe, expect, it } from "vitest";
import { parseChatMarkdown } from "./chat-markdown";

describe("parseChatMarkdown", () => {
  it("parses headings, lists, and bold", () => {
    const blocks = parseChatMarkdown("## Dogs\n\nDogs are **loyal**.\n\n- fetch\n- naps");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
  });
});
