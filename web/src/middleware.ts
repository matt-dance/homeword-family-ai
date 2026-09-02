import { NextRequest, NextResponse } from "next/server";
import {
  clientIpFromRequest,
  isLocalDashboardClient,
  normalizeHostname,
} from "@/lib/local-host";

// Kid chat endpoints that must stay reachable from phones and tablets on the LAN.
const KID_CHILD_PATHS = /^\/api\/v1\/children\/(public|\d+\/(starters|verify-pin|sessions\/resume))$/;

function isParentOnlyApi(path: string, method: string): boolean {
  if (path.startsWith("/api/v1/dashboard")) return true;
  if (path.startsWith("/api/v1/settings")) return true;
  if (path.startsWith("/api/v1/ollama/pull") || path.startsWith("/api/v1/ollama/bootstrap")) return true;
  if (path.startsWith("/api/v1/setup") && path !== "/api/v1/setup/status") return true;
  if (path.startsWith("/api/v1/auth/")) return !(path === "/api/v1/auth/login" && method !== "POST");
  if (path.startsWith("/api/v1/children")) return !KID_CHILD_PATHS.test(path);
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const local = isLocalDashboardClient(request.headers);
  const clientIp = clientIpFromRequest(request.headers);

  if (pathname.startsWith("/dashboard") && !local) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/setup") && !local) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isParentOnlyApi(pathname, request.method) && !local) {
    return NextResponse.json(
      { detail: "Parent dashboard is only available on this computer." },
      { status: 403 },
    );
  }

  // Always overwrite: the gateway trusts these from this proxy, so a client
  // must never be able to smuggle its own values through.
  const requestHeaders = new Headers(request.headers);
  const hostHeader = request.headers.get("host");
  requestHeaders.set("x-homeward-client-host", hostHeader ? normalizeHostname(hostHeader) : "");
  requestHeaders.set("x-homeward-client-ip", clientIp);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/setup", "/setup/:path*", "/api/v1/:path*"],
};
