import { describe, expect, it } from "vitest";
import { isParentOnlyApi } from "./parent-api";

describe("isParentOnlyApi", () => {
  it("keeps kid chat endpoints open on the LAN", () => {
    expect(isParentOnlyApi("/api/v1/children/public", "GET")).toBe(false);
    expect(isParentOnlyApi("/api/v1/children/3/starters", "GET")).toBe(false);
    expect(isParentOnlyApi("/api/v1/children/3/verify-pin", "POST")).toBe(false);
    expect(isParentOnlyApi("/api/v1/children/3/sessions/resume", "GET")).toBe(false);
    expect(isParentOnlyApi("/api/v1/chat", "POST")).toBe(false);
    expect(isParentOnlyApi("/api/v1/setup/status", "GET")).toBe(false);
  });

  it("blocks parent dashboard, settings, and model APIs", () => {
    expect(isParentOnlyApi("/api/v1/dashboard/sessions", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/settings/advanced", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/ollama/status", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/ollama/recommendations", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/ollama/pull", "POST")).toBe(true);
    expect(isParentOnlyApi("/api/v1/children", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/children/3/memory", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/children/3/memory", "POST")).toBe(true);
    expect(isParentOnlyApi("/api/v1/children/3/memory/abc123", "PATCH")).toBe(true);
    expect(isParentOnlyApi("/api/v1/children/3/memory/abc123", "DELETE")).toBe(true);
    expect(isParentOnlyApi("/api/v1/auth/me", "GET")).toBe(true);
    expect(isParentOnlyApi("/api/v1/auth/logout", "POST")).toBe(true);
    expect(isParentOnlyApi("/api/v1/setup", "POST")).toBe(true);
  });

  it("treats parent login POST as host-only", () => {
    expect(isParentOnlyApi("/api/v1/auth/login", "POST")).toBe(true);
  });
});
