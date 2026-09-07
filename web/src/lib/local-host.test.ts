import { describe, expect, it } from "vitest";
import {
  advertisedWebPort,
  clientIpFromRequest,
  homewardBaseUrl,
  isLocalDashboardClient,
  isLoopbackHostname,
  kidChatUrl,
  normalizeHostname,
  parentLocalUrl,
} from "./local-host";

describe("local-host", () => {
  it("does not treat homeward.local as loopback", () => {
    expect(isLoopbackHostname("homeward.local")).toBe(false);
    expect(isLoopbackHostname("homeward.local:80")).toBe(false);
  });

  it("recognizes loopback hostnames", () => {
    expect(isLoopbackHostname("localhost:43123")).toBe(true);
  });

  it("ignores client-supplied x-homeward-* headers when reading the client ip", () => {
    const headers = new Headers({
      "x-homeward-client-ip": "127.0.0.1",
      "x-forwarded-for": "192.168.1.99",
    });
    expect(clientIpFromRequest(headers)).toBe("192.168.1.99");
  });

  it("treats a LAN device with a homeward.local host as remote", () => {
    const headers = new Headers({ host: "homeward.local", "x-forwarded-for": "192.168.1.99" });
    expect(isLocalDashboardClient(headers)).toBe(false);
  });

  it("treats a loopback browser as local", () => {
    const headers = new Headers({ host: "localhost", "x-forwarded-for": "::1" });
    expect(isLocalDashboardClient(headers)).toBe(true);
  });

  it("normalizes host headers", () => {
    expect(normalizeHostname("Homeward.local:80")).toBe("homeward.local");
  });

  it("omits port 80 from default URL", () => {
    expect(homewardBaseUrl()).toBe("http://homeward.local");
    expect(homewardBaseUrl("homeward.local", 43123)).toBe("http://homeward.local:43123");
  });

  it("treats missing or port 80 as the default HTTP port", () => {
    expect(advertisedWebPort("")).toBe(80);
    expect(advertisedWebPort("80")).toBe(80);
    expect(advertisedWebPort(undefined)).toBe(80);
  });

  it("keeps non-80 ports for kid and parent URLs", () => {
    expect(advertisedWebPort("43123")).toBe(43123);
    expect(kidChatUrl(43123)).toBe("http://homeward.local:43123/chat");
    expect(parentLocalUrl(43123)).toBe("http://localhost:43123");
  });

  it("omits port 80 from kid and parent URLs", () => {
    expect(kidChatUrl(80)).toBe("http://homeward.local/chat");
    expect(parentLocalUrl(80)).toBe("http://localhost");
  });
});
