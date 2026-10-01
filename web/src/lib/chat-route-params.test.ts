import { describe, expect, it } from "vitest";
import {
  resolveChatSlug,
  slugFromParams,
  slugFromPathname,
} from "./chat-route-params";

describe("chat route params", () => {
  it("reads a string slug and ignores null params", () => {
    expect(slugFromParams({ slug: "avery" })).toBe("avery");
    expect(slugFromParams({ slug: ["jordan"] })).toBe("jordan");
    expect(slugFromParams(null)).toBe("");
    expect(slugFromParams(undefined)).toBe("");
    expect(slugFromParams({})).toBe("");
  });

  it("falls back to the /chat/[slug] pathname when params are missing", () => {
    expect(slugFromPathname("/chat/avery")).toBe("avery");
    expect(slugFromPathname("/chat/quick")).toBe("quick");
    expect(slugFromPathname("/chat")).toBe("");
    expect(slugFromPathname(null)).toBe("");
    expect(resolveChatSlug(null, "/chat/avery")).toBe("avery");
    expect(resolveChatSlug({ slug: "jordan" }, "/chat/avery")).toBe("jordan");
  });
});
