/** Pure conversation-loop state machine — no React, safe to unit test. */

export type VoiceConversationPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "waiting"
  | "speaking"
  | "ready";

export type VoiceConversationEvent =
  | { type: "START" }
  | { type: "STOP" }
  | { type: "LISTENING_STARTED" }
  | { type: "LISTENING_STOPPED" }
  | { type: "TRANSCRIPT"; text: string }
  | { type: "TRANSCRIBE_EMPTY" }
  | { type: "ASSISTANT_DONE"; text: string }
  | { type: "SPEAK_STARTED" }
  | { type: "SPEAK_ENDED" }
  | { type: "BARGE_IN" }
  | { type: "ERROR" };

export type VoiceConversationAction =
  | { type: "start_listening" }
  | { type: "stop_listening" }
  | { type: "stop_tts" }
  | { type: "speak"; text: string }
  | { type: "send_transcript"; text: string };

export interface VoiceConversationState {
  active: boolean;
  phase: VoiceConversationPhase;
}

export const INITIAL_VOICE_CONVERSATION: VoiceConversationState = {
  active: false,
  phase: "idle",
};

export function reduceVoiceConversation(
  state: VoiceConversationState,
  event: VoiceConversationEvent,
): { state: VoiceConversationState; actions: VoiceConversationAction[] } {
  if (event.type === "STOP") {
    if (!state.active && state.phase === "idle") {
      return { state, actions: [] };
    }
    return {
      state: { active: false, phase: "idle" },
      actions: [{ type: "stop_listening" }, { type: "stop_tts" }],
    };
  }

  if (event.type === "START") {
    if (state.active && state.phase !== "ready" && state.phase !== "idle") {
      return { state, actions: [] };
    }
    return {
      state: { active: true, phase: "ready" },
      actions: [{ type: "start_listening" }],
    };
  }

  if (!state.active) {
    // Never auto-start the loop. Tap barge-in may still stop leftover TTS.
    if (event.type === "BARGE_IN") {
      return { state, actions: [{ type: "stop_tts" }] };
    }
    return { state, actions: [] };
  }

  switch (event.type) {
    case "LISTENING_STARTED":
      return { state: { ...state, phase: "listening" }, actions: [] };
    case "LISTENING_STOPPED":
      return { state: { ...state, phase: "transcribing" }, actions: [] };
    case "TRANSCRIPT": {
      const text = event.text.trim();
      if (!text) {
        return {
          state: { ...state, phase: "ready" },
          actions: [{ type: "start_listening" }],
        };
      }
      return {
        state: { ...state, phase: "waiting" },
        actions: [{ type: "send_transcript", text }],
      };
    }
    case "TRANSCRIBE_EMPTY":
      return {
        state: { ...state, phase: "ready" },
        actions: [{ type: "start_listening" }],
      };
    case "ASSISTANT_DONE": {
      const text = event.text.trim();
      if (!text) {
        return {
          state: { ...state, phase: "ready" },
          actions: [{ type: "start_listening" }],
        };
      }
      return {
        state: { ...state, phase: "waiting" },
        actions: [{ type: "speak", text }],
      };
    }
    case "SPEAK_STARTED":
      return { state: { ...state, phase: "speaking" }, actions: [] };
    case "SPEAK_ENDED":
      return {
        state: { ...state, phase: "ready" },
        actions: [{ type: "start_listening" }],
      };
    case "BARGE_IN":
      return {
        state: { ...state, phase: "ready" },
        actions: [{ type: "stop_tts" }, { type: "start_listening" }],
      };
    case "ERROR":
      return { state: { ...state, phase: "ready" }, actions: [] };
    default:
      return { state, actions: [] };
  }
}
