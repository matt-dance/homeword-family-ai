import { NextRequest } from "next/server";
import { clientIpFromRequest, normalizeHostname } from "@/lib/local-host";
import { LLM_UNAVAILABLE_MESSAGE } from "@/lib/nonstream-chat-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/** Give the gateway time to return SSE headers; do not wait the full 120s empty. */
export const GATEWAY_HEADER_TIMEOUT_MS = 20_000;

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

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const active = signals.filter(Boolean);
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function sseNapResponse(): Response {
  const encoder = new TextEncoder();
  const body =
    `: connected\n\n` +
    `data: ${JSON.stringify({ type: "error", message: LLM_UNAVAILABLE_MESSAGE })}\n\n`;
  return new Response(encoder.encode(body), {
    status: 200,
    headers: SSE_HEADERS,
  });
}

/**
 * Dedicated SSE proxy so Next.js rewrites/middleware cannot buffer chat tokens.
 * Kid chat stays on /api/v1/chat/stream; only this path is handled here.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headerAbort = new AbortController();
  const headerTimer = setTimeout(() => headerAbort.abort("header-timeout"), GATEWAY_HEADER_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(`${GATEWAY_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: gatewayHeaders(request),
      body,
      cache: "no-store",
      signal: combineAbortSignals([request.signal, headerAbort.signal]),
    });
  } catch {
    // Gateway never sent headers (setup stall / wedged Ollama). Kid-safe nap,
    // not a silent 120s empty timeout through this proxy.
    return sseNapResponse();
  } finally {
    clearTimeout(headerTimer);
  }

  const contentType = upstream.headers.get("content-type");
  if (!upstream.body) {
    return sseNapResponse();
  }

  // PIN / rate-limit / setup failures are JSON. Forward them so the kid UI
  // can show the real message instead of a generic Internal Server Error.
  if (!isEventStream(contentType)) {
    const raw = await upstream.text();
    return new Response(raw, {
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
