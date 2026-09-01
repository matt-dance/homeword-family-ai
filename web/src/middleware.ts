import { NextRequest, NextResponse } from "next/server";
import {
  clientIpFromRequest,
  isLocalDashboardClient,
  normalizeHostname,
} from "@/lib/local-host";

function isParentOnlyApi(path: string, method: string): boolean {
  if (path.startsWith("/api/v1/dashboard")) return true;
  if (path.startsWith("/api/v1/settings")) return true;
  if (path.startsWith("/api/v1/ollama")) return true;
  if (path.startsWith("/api/v1/setup")) return true;
  if (path.startsWith("/api/v1/auth/me")) return true;
  if (path.startsWith("/api/v1/auth/change-password")) return true;
  if (path.startsWith("/api/v1/auth/reset-password")) return true;
  if (path.startsWith("/api/v1/auth/logout")) return true;
  if (path.startsWith("/api/v1/children") && !path.startsWith("/api/v1/children/public")) return true;
  if (path.startsWith("/api/v1/auth/login") && method === "POST") return true;
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

  const requestHeaders = new Headers(request.headers);
  const hostHeader = request.headers.get("host");
  if (hostHeader) {
    requestHeaders.set("x-homeward-client-host", normalizeHostname(hostHeader));
  }
  if (clientIp) {
    requestHeaders.set("x-homeward-client-ip", clientIp);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/setup", "/setup/:path*", "/api/v1/:path*"],
};
