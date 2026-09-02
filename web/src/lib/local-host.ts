/** Network URL helpers for Homeward. */

export const HOMEWARD_HOSTNAME = "homeward.local";
/** Public HTTP port advertised on the home network (standard port 80). */
export const HOMEWARD_PORT = 80;

export function homewardBaseUrl(
  hostname: string = HOMEWARD_HOSTNAME,
  port: number = HOMEWARD_PORT,
): string {
  if (port === 80) {
    return `http://${hostname}`;
  }
  return `http://${hostname}:${port}`;
}

export const DEFAULT_HOMEWARD_URL = homewardBaseUrl();

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

/** True when the client IP matches loopback or a known same-machine LAN address. */
export function isLocalClient(clientIp: string, serverIps: Set<string>): boolean {
  if (isLoopbackClient(clientIp)) return true;
  const ip = clientIp.trim().toLowerCase().replace(/^::ffff:/, "");
  return serverIps.has(ip);
}

export function clientIpFromRequest(headers: Headers): string {
  const explicit = headers.get("x-homeward-client-ip");
  if (explicit) return explicit.split(",")[0]?.trim() ?? "";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "";
}

/** Edge-safe: middleware cannot read host network interfaces (no Node `os`). */
export function isLocalDashboardClient(headers: Headers): boolean {
  const ip = clientIpFromRequest(headers);
  if (ip && isLoopbackClient(ip)) return true;
  return isLoopbackHostname(headers.get("host"));
}
