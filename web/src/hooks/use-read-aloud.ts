"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createReadAloudController,
  isReadAloudSupported,
  primeReadAloudFromGesture,
  type ReadAloudState,
} from "@/lib/read-aloud";

export function useReadAloud() {
  const controllerRef = useRef(createReadAloudController());
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ReadAloudState>({
    messageKey: null,
    wordIndex: 0,
    isSpeaking: false,
  });

  useEffect(() => {
    setSupported(isReadAloudSupported());
    return () => controllerRef.current.dispose();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current.stop();
    setState({ messageKey: null, wordIndex: 0, isSpeaking: false });
    setError(null);
  }, []);

  const speakMessage = useCallback(
    (messageKey: string, text: string) => {
      if (!text.trim()) return;

      primeReadAloudFromGesture();
      setError(null);

      if (state.isSpeaking && state.messageKey === messageKey) {
        stop();
        return;
      }

      stop();

      controllerRef.current.speak(text, {
        onStart: () => setState({ messageKey, wordIndex: 0, isSpeaking: true }),
        onWordIndex: (wordIndex) =>
          setState((prev) =>
            prev.messageKey === messageKey ? { ...prev, wordIndex, isSpeaking: true } : prev,
          ),
        onEnd: () => setState({ messageKey: null, wordIndex: 0, isSpeaking: false }),
        onError: (message) => {
          setError(message);
          setState({ messageKey: null, wordIndex: 0, isSpeaking: false });
        },
      });
    },
    [state.isSpeaking, state.messageKey, stop],
  );

  return {
    supported,
    error,
    state,
    speakMessage,
    stop,
    isSpeakingMessage: (messageKey: string) =>
      state.isSpeaking && state.messageKey === messageKey,
  };
}
