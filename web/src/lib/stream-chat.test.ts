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

  it("ignores SSE keepalive comments and still delivers tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          ": connected\n\n",
          ": keepalive\n\n",
          'data: {"type":"status","phase":"generating","message":"Writing a reply…"}\n\n',
          ": keepalive\n\n",
          'data: {"type":"token","content":"Hi"}\n\n',
          'data: {"type":"done","session_id":1}\n\n',
        ]),
      ),
    );

    const tokens: string[] = [];
    const statuses: string[] = [];
    await streamChat(
      "hi",
      1,
      (token) => tokens.push(token),
      () => {
        throw new Error("should not block");
      },
      () => undefined,
      1,
      undefined,
      undefined,
      undefined,
      (status) => statuses.push(status),
    );
    expect(tokens).toEqual(["Hi"]);
    expect(statuses[0]).toMatch(/Writing/i);
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

  it("surfaces a kid-safe message for raw Internal Server Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ detail: "Internal Server Error" }),
      })),
    );

    await expect(
      streamChat("hi", 1, () => undefined, () => undefined, () => undefined, 1),
    ).rejects.toThrow(/trouble answering|try again/i);
  });

  it("recovers a persisted reply when the SSE stream is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([]))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "The sky is blue because of scattering." },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const tokens: string[] = [];
    await streamChat("hi", 1, (token) => tokens.push(token), () => undefined, () => undefined, 1);
    expect(tokens.join("")).toMatch(/sky is blue/i);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws when the stream ends with no reply and no session to recover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([])));

    await expect(
      streamChat("hi", 1, () => undefined, () => undefined, () => undefined),
    ).rejects.toThrow(/too long to reply/i);
  });
});
