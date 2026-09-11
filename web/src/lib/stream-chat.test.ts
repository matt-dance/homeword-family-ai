import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_STREAM_FIRST_TOKEN_MS, CHAT_STREAM_IDLE_MS, streamChat } from "./api";

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

/** SSE that yields prefix chunks then hangs until the reader is cancelled. */
function hangingSseResponse(prefixChunks: string[] = []) {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < prefixChunks.length) {
        controller.enqueue(encoder.encode(prefixChunks[index]));
        index += 1;
        return;
      }
      return new Promise(() => undefined);
    },
  });
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: stream,
    json: async () => ({}),
  } as Response;
}

describe("streamChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("preserves standalone newline and space tokens from the model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"token","content":"Hello"}\n\n',
          'data: {"type":"token","content":"\\n"}\n\n',
          'data: {"type":"token","content":"\\n"}\n\n',
          'data: {"type":"token","content":"there"}\n\n',
          'data: {"type":"token","content":" "}\n\n',
          'data: {"type":"token","content":"again"}\n\n',
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
    expect(tokens).toEqual(["Hello", "\n", "\n", "there", " ", "again"]);
    expect(tokens.join("")).toBe("Hello\n\nthere again");
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

  it("forwards a card_route allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"card_route","allow":["timer","lookup"],"story_pages":null}\n\n',
          'data: {"type":"tools","tools":[{"type":"timer","seconds":10,"label":"10 seconds"}]}\n\n',
          'data: {"type":"done","session_id":1}\n\n',
        ]),
      ),
    );

    const routes: Array<{ allow: string[] | null }> = [];
    const tools: unknown[] = [];
    await streamChat(
      "Set a 10-second timer",
      1,
      () => undefined,
      () => {
        throw new Error("should not block");
      },
      () => undefined,
      1,
      (incoming) => tools.push(...incoming),
      undefined,
      false,
      undefined,
      (route) => routes.push(route),
    );
    expect(routes[0]?.allow).toEqual(["timer", "lookup"]);
    expect(tools[0]).toMatchObject({ type: "timer", seconds: 10 });
  });

  it("forwards a howto card_route and tools payload the kid UI can render", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"card_route","allow":["howto","lookup"],"story_pages":null}\n\n',
          'data: {"type":"tools","tools":[{"type":"howto","title":"Make pancakes","steps":["Mix","Cook"]}]}\n\n',
          'data: {"type":"token","content":"You can do it!"}\n\n',
          'data: {"type":"done","session_id":1}\n\n',
        ]),
      ),
    );

    const routes: Array<{ allow: string[] | null }> = [];
    const tools: unknown[] = [];
    const tokens: string[] = [];
    await streamChat(
      "How do I make pancakes?",
      1,
      (token) => tokens.push(token),
      () => {
        throw new Error("should not block");
      },
      () => undefined,
      1,
      (incoming) => tools.push(...incoming),
      undefined,
      false,
      undefined,
      (route) => routes.push(route),
    );
    expect(routes[0]?.allow).toEqual(["howto", "lookup"]);
    expect(tools[0]).toMatchObject({ type: "howto", title: "Make pancakes", steps: ["Mix", "Cook"] });
    expect(tokens.join("")).toBe("You can do it!");
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

  it("uses nap copy when a blocked event has blank message text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"blocked","message":"\\n"}\n\n',
          'data: {"type":"done","session_id":1}\n\n',
        ]),
      ),
    );

    const blocked: string[] = [];
    await streamChat("hi", 1, () => undefined, (msg) => blocked.push(msg), () => undefined, 1);
    expect(blocked[0]).toMatch(/nap|try again/i);
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

  it("naps when the stream ends with no reply and no session to recover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([])));

    const blocked: string[] = [];
    await streamChat("hi", 1, () => undefined, (msg) => blocked.push(msg), () => undefined);
    expect(blocked[0]).toMatch(/nap|try again/i);
  });

  it("naps instead of throwing when the body read fails with TypeError terminated", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(new TypeError("terminated"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          body: stream,
          json: async () => ({}),
        }) as Response,
      ),
    );

    const blocked: string[] = [];
    await expect(
      streamChat("hi", 1, () => undefined, (msg) => blocked.push(msg), () => undefined),
    ).resolves.toBeUndefined();
    expect(blocked[0]).toMatch(/nap|try again/i);
  });

  it("does not reject when an onToken callback throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"type":"token","content":"Hello"}\n\n',
          'data: {"type":"done","session_id":1}\n\n',
        ]),
      ),
    );

    await expect(
      streamChat(
        "hi",
        1,
        () => {
          throw new Error("client render exploded");
        },
        () => undefined,
        () => undefined,
        1,
      ),
    ).resolves.toBeUndefined();
  });

  it("waits past the 25s idle window for a cold first token, then naps", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        hangingSseResponse([
          'data: {"type":"status","phase":"generating","message":"Writing a reply…"}\n\n',
        ]),
      ),
    );

    const blocked: string[] = [];
    const finished = streamChat(
      "tell me about dinosaurs",
      1,
      () => {
        throw new Error("should not token");
      },
      (msg) => blocked.push(msg),
      () => undefined,
      1,
    );

    await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_MS + 1_000);
    expect(blocked).toEqual([]);

    await vi.advanceTimersByTimeAsync(CHAT_STREAM_FIRST_TOKEN_MS);
    await finished;
    expect(blocked[0]).toMatch(/nap|try again/i);
  });
});
