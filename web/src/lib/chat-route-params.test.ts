import { describe, expect, it } from "vitest";
import {
  isForceProfilePick,
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

  it("treats pick=1 as force-pick even when useSearchParams is null", () => {
    expect(isForceProfilePick(new URLSearchParams("pick=1"))).toBe(true);
    expect(isForceProfilePick(null, "?pick=1")).toBe(true);
    expect(isForceProfilePick(null, "pick=1")).toBe(true);
    expect(isForceProfilePick(null, "")).toBe(false);
    expect(isForceProfilePick(null, "?pick=0")).toBe(false);
    expect(isForceProfilePick(null)).toBe(false);
  });
});
