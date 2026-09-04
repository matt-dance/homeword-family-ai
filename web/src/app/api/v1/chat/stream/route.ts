import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";

/**
 * Dedicated SSE proxy so Next.js rewrites cannot buffer chat tokens.
 * Kid chat stays on /api/v1/chat/stream; only this path is handled here.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const clientHost = request.headers.get("x-homeward-client-host");
  const clientIp = request.headers.get("x-homeward-client-ip");
  if (clientHost) headers.set("x-homeward-client-host", clientHost);
  if (clientIp) headers.set("x-homeward-client-ip", clientIp);

  const upstream = await fetch(`${GATEWAY_URL}/api/v1/chat/stream`, {
    method: "POST",
    headers,
    body: await request.text(),
    cache: "no-store",
  });

  if (!upstream.body) {
    return Response.json({ detail: "Stream failed" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
