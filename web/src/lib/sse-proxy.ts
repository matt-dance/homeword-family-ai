import { LLM_UNAVAILABLE_MESSAGE } from "@/lib/nonstream-chat-error";

/** Match gateway SSE heartbeats so the browser sees bytes during a quiet first-token wait. */
export const SSE_PROXY_KEEPALIVE_MS = 8_000;
/** Classifier + cold llama3.2:3b first token (gateway default 45s) with slack. */
export const SSE_PROXY_FIRST_TOKEN_MS = 60_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SSE_KEEPALIVE_CHUNK = encoder.encode(": keepalive\n\n");

export function encodeSseError(message: string): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
}

export function chunkHasKidReplyEvent(bytes: Uint8Array): boolean {
  const text = decoder.decode(bytes);
  return /"type"\s*:\s*"(token|error|blocked|done|tools)"/.test(text);
}

export function safeEnqueue(
  controller: { enqueue: (chunk: Uint8Array) => void },
  chunk: Uint8Array,
): boolean {
  try {
    controller.enqueue(chunk);
    return true;
  } catch {
    return false;
  }
}

export function safeClose(controller: { close: () => void }): void {
  try {
    controller.close();
  } catch {
    // already closed / errored
  }
}

type ReadResult = ReadableStreamReadResult<Uint8Array>;

/**
 * Pipe gateway SSE to the browser, emitting keepalives while upstream is quiet.
 * If no token/error/blocked/done arrives before first-token budget, send a nap event
 * instead of hanging until the client idle-aborts.
 */
export async function pumpSseWithKeepalives(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  options: {
    keepaliveMs?: number;
    firstTokenMs?: number;
    signal?: AbortSignal;
    napMessage?: string;
    now?: () => number;
  } = {},
): Promise<void> {
  const keepaliveMs = options.keepaliveMs ?? SSE_PROXY_KEEPALIVE_MS;
  const firstTokenMs = options.firstTokenMs ?? SSE_PROXY_FIRST_TOKEN_MS;
  const napMessage = options.napMessage ?? LLM_UNAVAILABLE_MESSAGE;
  const now = options.now ?? Date.now;
  const started = now();
  let sawReplyEvent = false;
  let pending: Promise<ReadResult> | null = null;

  const ignorePending = () => {
    pending?.catch(() => undefined);
  };

  const readNext = (): Promise<ReadResult> => {
    if (!pending) {
      pending = reader.read().then(
        (result) => {
          pending = null;
          return result;
        },
        (error: unknown) => {
          pending = null;
          throw error;
        },
      );
    }
    return pending;
  };

  const napAndStop = async () => {
    safeEnqueue(controller, encodeSseError(napMessage));
    ignorePending();
    await reader.cancel().catch(() => undefined);
  };

  try {
    while (true) {
      if (options.signal?.aborted) {
        ignorePending();
        await reader.cancel().catch(() => undefined);
        break;
      }

      const remainingFirstToken = firstTokenMs - (now() - started);
      if (!sawReplyEvent && remainingFirstToken <= 0) {
        await napAndStop();
        break;
      }

      const idleMs = sawReplyEvent
        ? keepaliveMs
        : Math.min(keepaliveMs, Math.max(1, remainingFirstToken));

      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<"idle">((resolve) => {
        idleTimer = setTimeout(() => resolve("idle"), idleMs);
      });

      try {
        const raced = await Promise.race([
          readNext().then((result) => ({ kind: "read" as const, result })),
          idle.then(() => ({ kind: "idle" as const })),
        ]);

        if (raced.kind === "idle") {
          if (!sawReplyEvent && now() - started >= firstTokenMs) {
            await napAndStop();
            break;
          }
          if (!safeEnqueue(controller, SSE_KEEPALIVE_CHUNK)) break;
          continue;
        }

        if (raced.result.done) {
          if (!sawReplyEvent) {
            safeEnqueue(controller, encodeSseError(napMessage));
          }
          break;
        }
        const value = raced.result.value;
        if (value && value.byteLength > 0) {
          if (chunkHasKidReplyEvent(value)) sawReplyEvent = true;
          if (!safeEnqueue(controller, value)) break;
        }
      } catch {
        if (!sawReplyEvent) {
          safeEnqueue(controller, encodeSseError(napMessage));
        }
        ignorePending();
        await reader.cancel().catch(() => undefined);
        break;
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }
    }
  } finally {
    ignorePending();
    safeClose(controller);
  }
}
