import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOMEWARD_URL,
  homewardBaseUrl,
  isLocalClient,
  isLoopbackHostname,
  normalizeHostname,
} from "./local-host";

describe("local-host", () => {
  it("does not treat homeward.local as loopback", () => {
    expect(isLoopbackHostname("homeward.local")).toBe(false);
    expect(isLoopbackHostname("homeward.local:80")).toBe(false);
  });

  it("recognizes loopback hostnames", () => {
    expect(isLoopbackHostname("localhost:43123")).toBe(true);
  });

  it("detects same-machine client by IP", () => {
    const serverIps = new Set(["127.0.0.1", "192.168.1.10"]);
    expect(isLocalClient("192.168.1.10", serverIps)).toBe(true);
    expect(isLocalClient("192.168.1.99", serverIps)).toBe(false);
  });

  it("normalizes host headers", () => {
    expect(normalizeHostname("Homeward.local:80")).toBe("homeward.local");
  });

  it("omits port 80 from default URL", () => {
    expect(homewardBaseUrl()).toBe("http://homeward.local");
    expect(DEFAULT_HOMEWARD_URL).toBe("http://homeward.local");
    expect(homewardBaseUrl("homeward.local", 43123)).toBe("http://homeward.local:43123");
  });
});
