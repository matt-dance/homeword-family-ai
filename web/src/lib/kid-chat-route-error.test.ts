import { describe, expect, it } from "vitest";
import { STREAM_STALL_MESSAGE } from "./kid-chat-stream-error";
import {
  KID_CHAT_ROUTE_EXCEPTION_MESSAGE,
  kidChatRouteErrorMessage,
  ollamaReadyFromHealth,
} from "./kid-chat-route-error";

describe("kid chat route error copy", () => {
  it("uses nap copy only when the health check says the model is down", () => {
    expect(kidChatRouteErrorMessage(false)).toBe(STREAM_STALL_MESSAGE);
    expect(kidChatRouteErrorMessage(true)).toBe(KID_CHAT_ROUTE_EXCEPTION_MESSAGE);
    expect(kidChatRouteErrorMessage(null)).toBe(KID_CHAT_ROUTE_EXCEPTION_MESSAGE);
  });

  it("reads ollama.ready from the health payload", () => {
    expect(ollamaReadyFromHealth({ ollama: { ready: true } })).toBe(true);
    expect(ollamaReadyFromHealth({ ollama: { ready: false } })).toBe(false);
    expect(ollamaReadyFromHealth({ status: "ok" } as { ollama?: { ready?: boolean } })).toBe(false);
    expect(ollamaReadyFromHealth(null)).toBe(false);
  });
});
