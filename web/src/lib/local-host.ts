export function advertisedWebPort(locationPort?: string): number {
  const raw =
    locationPort ?? (typeof window === "undefined" ? "" : window.location.port);
  if (!raw || raw === "80") return 80;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 80;
}

export function parentLocalUrl(port: number = advertisedWebPort()): string {
  if (port === 80) return "http://localhost";
  return `http://localhost:${port}`;
}

export function normalizeHostname(hostHeader: string | null): string {
  return hostHeader?.split(":")[0]?.replace(/^\[|\]$/g, "").toLowerCase() ?? "";
}

/** Loopback hostnames only — not homeward.local (that is shared on the LAN). */
export function isLoopbackHostname(hostHeader: string | null): boolean {
  const host = normalizeHostname(hostHeader);
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.startsWith("127.");
}

export function isLoopbackClient(clientIp: string): boolean {
  if (!clientIp) return false;
  const ip = clientIp.trim().toLowerCase().replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.");
}

/**
 * Best-effort client address. Next.js fills `x-forwarded-for` from the socket
 * when absent; an explicit header from a non-browser client can still lie, so
 * the gateway treats this as a hint on top of the parent session cookie.
 */
export function clientIpFromRequest(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  return "";
}

/**
 * Edge-safe host check for the parent dashboard.
 * Only loopback counts — `homeward.local` is shared on the LAN, and Edge
 * cannot enumerate this machine's interface IPs (no Node `os`). Parents on
 * this computer should use localhost.
 */
export function isLocalDashboardClient(headers: Headers): boolean {
  const ip = clientIpFromRequest(headers);
  if (ip && isLoopbackClient(ip)) return true;
  return isLoopbackHostname(headers.get("host"));
}
