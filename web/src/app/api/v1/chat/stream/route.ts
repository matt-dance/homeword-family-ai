import { NextRequest } from "next/server";
import { clientIpFromRequest, normalizeHostname } from "@/lib/local-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "Content-Encoding": "identity",
} as const;

function gatewayHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  // This path is excluded from middleware so the response can flush. Set the
  // same trusted client hints the gateway uses for rate limits / PIN cookies.
  const hostHeader = request.headers.get("host");
  headers.set("x-homeward-client-host", hostHeader ? normalizeHostname(hostHeader) : "");
  headers.set("x-homeward-client-ip", clientIpFromRequest(request.headers));
  return headers;
}

function isEventStream(contentType: string | null): boolean {
  return (contentType || "").includes("text/event-stream");
}

/**
 * Dedicated SSE proxy so Next.js rewrites/middleware cannot buffer chat tokens.
 * Kid chat stays on /api/v1/chat/stream; only this path is handled here.
 */
export async function POST(request: NextRequest) {
  let upstream: Response;
  try {
    upstream = await fetch(`${GATEWAY_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: gatewayHeaders(request),
      body: await request.text(),
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return Response.json(
      {
        detail:
          "Homeward could not reach the chat service. Ask a parent to check that Homeward is running.",
      },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type");
  if (!upstream.body) {
    return Response.json({ detail: "Stream failed" }, { status: 502 });
  }

  // PIN / rate-limit / setup failures are JSON. Forward them so the kid UI
  // can show the real message instead of a generic Internal Server Error.
  if (!isEventStream(contentType)) {
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": contentType || "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const abort = () => {
        void reader.cancel().catch(() => undefined);
      };
      request.signal.addEventListener("abort", abort, { once: true });
      try {
        // Immediate comment so the browser sees first bytes before llama tokens.
        controller.enqueue(encoder.encode(": connected\n\n"));
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch {
        try {
          controller.close();
        } catch {
          // already closed
        }
      } finally {
        request.signal.removeEventListener("abort", abort);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: SSE_HEADERS,
  });
}
