/** Parent-only API paths. Kid chat must stay reachable from phones on the LAN. */

const KID_CHILD_PATHS =
  /^\/api\/v1\/children\/(public|\d+\/(starters|verify-pin|sessions\/resume))$/;

export function isParentOnlyApi(path: string, method: string): boolean {
  if (path.startsWith("/api/v1/dashboard")) return true;
  if (path.startsWith("/api/v1/settings")) return true;
  if (path.startsWith("/api/v1/ollama")) return true;
  if (path.startsWith("/api/v1/setup") && path !== "/api/v1/setup/status") return true;
  if (path.startsWith("/api/v1/auth/")) return !(path === "/api/v1/auth/login" && method !== "POST");
  if (path.startsWith("/api/v1/children")) return !KID_CHILD_PATHS.test(path);
  return false;
}
