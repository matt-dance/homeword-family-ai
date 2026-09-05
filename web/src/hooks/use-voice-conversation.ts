"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReadAloud } from "@/hooks/use-read-aloud";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import {
  INITIAL_VOICE_CONVERSATION,
  reduceVoiceConversation,
  type VoiceConversationAction,
  type VoiceConversationEvent,
  type VoiceConversationState,
} from "@/lib/voice-conversation";

export interface UseVoiceConversationOptions {
  onTranscript: (text: string) => void;
  voiceGender?: "female" | "male";
}

/**
 * Optional conversation mode: kid taps once, talks, hears the reply, then
 * Homeward listens again. Barge-in (tap or speech) stops TTS and listens.
 * Does not start without a kid gesture.
 */
export function useVoiceConversation({ onTranscript, voiceGender }: UseVoiceConversationOptions) {
  const [loop, setLoop] = useState<VoiceConversationState>(INITIAL_VOICE_CONVERSATION);
  const [bargeInWatchFailed, setBargeInWatchFailed] = useState(false);
  const loopRef = useRef(loop);
  const onTranscriptRef = useRef(onTranscript);
  const applyActionsRef = useRef<(actions: VoiceConversationAction[]) => void>(() => undefined);
  const speakKeyRef = useRef("conversation-turn");
  const listeningRef = useRef(false);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const {
    supported: readAloudSupported,
    error: readAloudError,
    state: readAloudState,
    speakMessage,
    stop: stopReadAloud,
    isSpeakingMessage,
  } = useReadAloud(voiceGender);

  const dispatch = useCallback((event: VoiceConversationEvent) => {
    const next = reduceVoiceConversation(loopRef.current, event);
    loopRef.current = next.state;
    setLoop(next.state);
    applyActionsRef.current(next.actions);
  }, []);

  const voice = useVoiceChat({
    onTranscript: (text) => {
      if (loopRef.current.active) {
        dispatch({ type: "TRANSCRIPT", text });
      } else {
        onTranscriptRef.current(text);
      }
    },
    onListeningStart: () => {
      stopReadAloud();
      if (loopRef.current.active) dispatch({ type: "LISTENING_STARTED" });
    },
    onTranscriptEmpty: () => {
      if (loopRef.current.active) {
        dispatch({ type: "TRANSCRIBE_EMPTY" });
        return true;
      }
      return false;
    },
    onError: () => {
      if (loopRef.current.active) dispatch({ type: "ERROR" });
    },
  });

  const {
    startListening,
    stopListening,
    startBargeInWatch,
    stopBargeInWatch,
    listening,
  } = voice;

  listeningRef.current = listening;

  useEffect(() => {
    if (loop.active && !listening && loop.phase === "listening") {
      dispatch({ type: "LISTENING_STOPPED" });
    }
  }, [listening, loop.active, loop.phase, dispatch]);

  const applyActions = useCallback(
    (actions: VoiceConversationAction[]) => {
      for (const action of actions) {
        if (action.type === "start_listening") {
          setBargeInWatchFailed(false);
          stopBargeInWatch();
          void startListening();
        } else if (action.type === "stop_listening") {
          stopListening();
          stopBargeInWatch();
        } else if (action.type === "stop_tts") {
          stopBargeInWatch();
          stopReadAloud();
        } else if (action.type === "speak") {
          speakMessage(speakKeyRef.current, action.text, {
            onStart: () => {
              dispatch({ type: "SPEAK_STARTED" });
              void startBargeInWatch(() => dispatch({ type: "BARGE_IN" })).then((ok) => {
                setBargeInWatchFailed(!ok);
              });
            },
            onEnd: () => {
              stopBargeInWatch();
              setBargeInWatchFailed(false);
              dispatch({ type: "SPEAK_ENDED" });
            },
          });
        } else if (action.type === "send_transcript") {
          onTranscriptRef.current(action.text);
        }
      }
    },
    [dispatch, speakMessage, startBargeInWatch, startListening, stopBargeInWatch, stopListening, stopReadAloud],
  );

  useEffect(() => {
    applyActionsRef.current = applyActions;
  }, [applyActions]);

  const startConversation = useCallback(() => {
    dispatch({ type: "START" });
    if (listeningRef.current) {
      dispatch({ type: "LISTENING_STARTED" });
    }
  }, [dispatch]);

  const stopConversation = useCallback(() => {
    setBargeInWatchFailed(false);
    dispatch({ type: "STOP" });
  }, [dispatch]);

  const toggleConversation = useCallback(() => {
    if (loopRef.current.active) {
      setBargeInWatchFailed(false);
      dispatch({ type: "STOP" });
    } else {
      dispatch({ type: "START" });
      if (listeningRef.current) {
        dispatch({ type: "LISTENING_STARTED" });
      }
    }
  }, [dispatch]);

  const notifyAssistantDone = useCallback(
    (text: string, messageKey = "conversation-turn") => {
      if (!loopRef.current.active) return;
      speakKeyRef.current = messageKey;
      dispatch({ type: "ASSISTANT_DONE", text });
    },
    [dispatch],
  );

  const bargeIn = useCallback(() => {
    dispatch({ type: "BARGE_IN" });
  }, [dispatch]);

  return {
    conversationActive: loop.active,
    conversationPhase: loop.phase,
    bargeInWatchFailed,
    startConversation,
    stopConversation,
    toggleConversation,
    notifyAssistantDone,
    bargeIn,
    listening: voice.listening,
    transcribing: voice.transcribing,
    voiceSupported: voice.voiceSupported,
    speechError: voice.speechError,
    audioLevel: voice.audioLevel,
    interimTranscript: voice.interimTranscript,
    heardSpeech: voice.heardSpeech,
    toggleListening: voice.toggleListening,
    startListening: voice.startListening,
    stopListening: voice.stopListening,
    readAloudSupported,
    readAloudError,
    readAloudState,
    speakMessage,
    stopReadAloud,
    isSpeakingMessage,
  };
}
