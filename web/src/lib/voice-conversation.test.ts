import { describe, expect, it } from "vitest";
import {
  INITIAL_VOICE_CONVERSATION,
  reduceVoiceConversation,
  type VoiceConversationState,
} from "./voice-conversation";

function apply(
  state: VoiceConversationState,
  event: Parameters<typeof reduceVoiceConversation>[1],
) {
  return reduceVoiceConversation(state, event);
}

describe("reduceVoiceConversation", () => {
  it("does not auto-start from idle on assistant or transcript events", () => {
    const fromAssistant = apply(INITIAL_VOICE_CONVERSATION, {
      type: "ASSISTANT_DONE",
      text: "Hello",
    });
    expect(fromAssistant.state.active).toBe(false);
    expect(fromAssistant.actions).toEqual([]);

    const fromTranscript = apply(INITIAL_VOICE_CONVERSATION, {
      type: "TRANSCRIPT",
      text: "hi",
    });
    expect(fromTranscript.state.active).toBe(false);
    expect(fromTranscript.actions).toEqual([]);
  });

  it("START from idle begins the loop and listens (kid gesture)", () => {
    const { state, actions } = apply(INITIAL_VOICE_CONVERSATION, { type: "START" });
    expect(state).toEqual({ active: true, phase: "ready" });
    expect(actions).toEqual([{ type: "start_listening" }]);
  });

  it("STOP leaves the loop and silences mic plus TTS", () => {
    const active: VoiceConversationState = { active: true, phase: "speaking" };
    const { state, actions } = apply(active, { type: "STOP" });
    expect(state).toEqual({ active: false, phase: "idle" });
    expect(actions).toEqual([{ type: "stop_listening" }, { type: "stop_tts" }]);
  });

  it("sends a transcript then waits for the assistant", () => {
    const listening: VoiceConversationState = { active: true, phase: "listening" };
    const { state, actions } = apply(listening, { type: "TRANSCRIPT", text: " what are stars " });
    expect(state.phase).toBe("waiting");
    expect(actions).toEqual([{ type: "send_transcript", text: "what are stars" }]);
  });

  it("reads the assistant reply aloud after the turn finishes", () => {
    const waiting: VoiceConversationState = { active: true, phase: "waiting" };
    const { actions } = apply(waiting, {
      type: "ASSISTANT_DONE",
      text: "Stars are giant balls of gas.",
    });
    expect(actions).toEqual([{ type: "speak", text: "Stars are giant balls of gas." }]);
  });

  it("listens again after TTS ends", () => {
    const speaking: VoiceConversationState = { active: true, phase: "speaking" };
    const { state, actions } = apply(speaking, { type: "SPEAK_ENDED" });
    expect(state.phase).toBe("ready");
    expect(actions).toEqual([{ type: "start_listening" }]);
  });

  it("barge-in stops TTS and starts listening", () => {
    const speaking: VoiceConversationState = { active: true, phase: "speaking" };
    const { state, actions } = apply(speaking, { type: "BARGE_IN" });
    expect(state.active).toBe(true);
    expect(state.phase).toBe("ready");
    expect(actions).toEqual([{ type: "stop_tts" }, { type: "start_listening" }]);
  });

  it("empty transcript listens again instead of sending", () => {
    const transcribing: VoiceConversationState = { active: true, phase: "transcribing" };
    const { actions } = apply(transcribing, { type: "TRANSCRIBE_EMPTY" });
    expect(actions).toEqual([{ type: "start_listening" }]);
  });

  it("empty assistant reply listens again instead of speaking", () => {
    const waiting: VoiceConversationState = { active: true, phase: "waiting" };
    const { state, actions } = apply(waiting, { type: "ASSISTANT_DONE", text: "  " });
    expect(state.phase).toBe("ready");
    expect(actions).toEqual([{ type: "start_listening" }]);
  });

  it("ERROR stays in the loop so the kid can tap the mic again", () => {
    const listening: VoiceConversationState = { active: true, phase: "listening" };
    const { state, actions } = apply(listening, { type: "ERROR" });
    expect(state).toEqual({ active: true, phase: "ready" });
    expect(actions).toEqual([]);
  });

  it("LISTENING_STOPPED marks transcribing", () => {
    const listening: VoiceConversationState = { active: true, phase: "listening" };
    const { state } = apply(listening, { type: "LISTENING_STOPPED" });
    expect(state.phase).toBe("transcribing");
  });
});
