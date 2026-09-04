import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "./api";

function sseResponse(chunks: string[], { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
  return {
    ok,
    status,
    statusText: "OK",
    body: stream,
    json: async () => ({ detail: "Stream failed" }),
  } as Response;
}

describe("streamChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("delivers tokens and finishes on done", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"status","phase":"checking"}\n\n',
          'data: {"type":"token","content":"Hello"}\n\n',
          'data: {"type":"done","session_id":1}\n\n',
        ]),
      ),
    );

    const tokens: string[] = [];
    await streamChat(
      "hi",
      1,
      (token) => tokens.push(token),
      () => {
        throw new Error("should not block");
      },
      () => undefined,
      1,
    );
    expect(tokens).toEqual(["Hello"]);
  });

  it("surfaces a gateway error instead of hanging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"status","phase":"checking"}\n\n',
          'data: {"type":"error","message":"Homeward\\u2019s brain is taking a nap right now."}\n\n',
        ]),
      ),
    );

    const blocked: string[] = [];
    await streamChat("hi", 1, () => undefined, (msg) => blocked.push(msg), () => undefined, 1);
    expect(blocked[0]).toMatch(/nap|try again/i);
  });

  it("throws when the stream ends with no reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([])));

    await expect(
      streamChat("hi", 1, () => undefined, () => undefined, () => undefined, 1),
    ).rejects.toThrow(/too long to reply/i);
  });
});
