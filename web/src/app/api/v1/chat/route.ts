import { NextRequest } from "next/server";
import {
  kidSafeChatError,
  shouldReplaceWithKidSafeChatError,
} from "@/lib/nonstream-chat-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";

/**
 * Dedicated proxy for non-stream POST /api/v1/chat.
 * Next.js rewrites time out around 30s with a bare HTTP 500 while Ollama is
 * still loading/thinking. This handler waits for the gateway and turns
 * timeout / 5xx misses into the same kid-safe JSON the stream path uses.
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

  let upstream: Response;
  try {
    upstream = await fetch(`${GATEWAY_URL}/api/v1/chat`, {
      method: "POST",
      headers,
      body: await request.text(),
      cache: "no-store",
    });
  } catch {
    return Response.json(kidSafeChatError(), { status: 200 });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const raw = await upstream.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (shouldReplaceWithKidSafeChatError(upstream.status, parsed)) {
    return Response.json(kidSafeChatError(), { status: 200 });
  }

  return new Response(raw || JSON.stringify(parsed ?? kidSafeChatError()), {
    status: upstream.status,
    headers: {
      "Content-Type": contentType.includes("json") ? contentType : "application/json",
    },
  });
}
