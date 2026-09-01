/** Network URL helpers for Homeward. */

export const HOMEWARD_HOSTNAME = "homeward.local";
export const HOMEWARD_PORT = 43123;
export const DEFAULT_HOMEWARD_URL = `http://${HOMEWARD_HOSTNAME}:${HOMEWARD_PORT}`;

export function normalizeHostname(hostHeader: string | null): string {
  return hostHeader?.split(":")[0]?.replace(/^\[|\]$/g, "").toLowerCase() ?? "";
}

/** Loopback hostnames only — not homeward.local (that is shared on the LAN). */
export function isLoopbackHostname(hostHeader: string | null): boolean {
  const host = normalizeHostname(hostHeader);
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.startsWith("127.");
}

export function getServerInterfaceIps(): Set<string> {
  // Middleware runs on Node.js; networkInterfaces is available at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os") as typeof import("os");
  const ips = new Set(["127.0.0.1", "::1"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4") ips.add(addr.address);
    }
  }
  return ips;
}

export function isLocalClient(clientIp: string, serverIps?: Set<string>): boolean {
  if (!clientIp) return false;
  const ip = clientIp.trim().toLowerCase().replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.")) return true;
  const ips = serverIps ?? getServerInterfaceIps();
  return ips.has(ip);
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

export function isLocalDashboardClient(headers: Headers): boolean {
  const ip = clientIpFromRequest(headers);
  if (ip && isLocalClient(ip)) return true;
  return isLoopbackHostname(headers.get("host"));
}
