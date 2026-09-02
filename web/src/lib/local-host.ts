/** Network URL helpers for Homeward. */

const HOMEWARD_HOSTNAME = "homeward.local";
/** Public HTTP port advertised on the home network (standard port 80). */
const HOMEWARD_PORT = 80;

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
 * this computer should use localhost or the /etc/hosts mapping from
 * setup-local-url.sh so homeward.local resolves to 127.0.0.1.
 */
export function isLocalDashboardClient(headers: Headers): boolean {
  const ip = clientIpFromRequest(headers);
  if (ip && isLoopbackClient(ip)) return true;
  return isLoopbackHostname(headers.get("host"));
}
