import { afterEach, describe, expect, it, vi } from "vitest";
import { LLM_UNAVAILABLE_MESSAGE } from "./nonstream-chat-error";
import {
  chunkHasKidReplyEvent,
  encodeSseError,
  pumpSseWithKeepalives,
  SSE_PROXY_FIRST_TOKEN_MS,
} from "./sse-proxy";

describe("chunkHasKidReplyEvent", () => {
  const encoder = new TextEncoder();

  it("detects token and error events but not status/keepalives", () => {
    expect(chunkHasKidReplyEvent(encoder.encode('data: {"type":"status","message":"Writing a reply…"}\n\n'))).toBe(
      false,
    );
    expect(chunkHasKidReplyEvent(encoder.encode(": keepalive\n\n"))).toBe(false);
    expect(chunkHasKidReplyEvent(encoder.encode('data: {"type":"token","content":"Hi"}\n\n'))).toBe(true);
    expect(chunkHasKidReplyEvent(encoder.encode('data: {"type":"error","message":"nap"}\n\n'))).toBe(true);
  });
});

describe("pumpSseWithKeepalives", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits a nap error when upstream hangs before any token", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
    });
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    const decoder = new TextDecoder();
    const controller = {
      enqueue(chunk: Uint8Array) {
        chunks.push(chunk);
      },
      close() {},
    } as ReadableStreamDefaultController<Uint8Array>;

    const pumped = pumpSseWithKeepalives(reader, controller, {
      keepaliveMs: 8_000,
      firstTokenMs: SSE_PROXY_FIRST_TOKEN_MS,
    });

    await vi.advanceTimersByTimeAsync(SSE_PROXY_FIRST_TOKEN_MS + 50);
    await pumped;

    const text = chunks.map((chunk) => decoder.decode(chunk)).join("");
    expect(text).toContain('"type":"error"');
    expect(text).toMatch(/nap|try again/i);
  });

  it("forwards a token without napping", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"token","content":"Hi"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"done","session_id":1}\n\n'));
        controller.close();
      },
    });
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    const decoder = new TextDecoder();
    const controller = {
      enqueue(chunk: Uint8Array) {
        chunks.push(chunk);
      },
      close() {},
    } as ReadableStreamDefaultController<Uint8Array>;

    await pumpSseWithKeepalives(reader, controller, { firstTokenMs: 1_000, keepaliveMs: 50 });
    const text = chunks.map((chunk) => decoder.decode(chunk)).join("");
    expect(text).toContain("Hi");
    expect(text).not.toContain(LLM_UNAVAILABLE_MESSAGE);
  });

  it("encodes a kid-safe SSE error event", () => {
    const text = new TextDecoder().decode(encodeSseError(LLM_UNAVAILABLE_MESSAGE));
    expect(text.startsWith("data: ")).toBe(true);
    expect(text).toMatch(/nap|try again/i);
  });
});
