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
  const [state, setState] = useState<ReadAloudState>({
    messageKey: null,
    charIndex: 0,
    isSpeaking: false,
  });

  useEffect(() => {
    setSupported(isReadAloudSupported());
    return () => controllerRef.current.dispose();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current.stop();
    setState({ messageKey: null, charIndex: 0, isSpeaking: false });
  }, []);

  const speakMessage = useCallback(
    (messageKey: string, text: string) => {
      if (!text.trim()) return;

      primeReadAloudFromGesture();

      if (state.isSpeaking && state.messageKey === messageKey) {
        stop();
        return;
      }

      setState({ messageKey, charIndex: 0, isSpeaking: true });

      controllerRef.current.speak(text, {
        onStart: () => setState((prev) => ({ ...prev, isSpeaking: true, charIndex: 0 })),
        onBoundary: (charIndex) =>
          setState((prev) =>
            prev.messageKey === messageKey ? { ...prev, charIndex, isSpeaking: true } : prev,
          ),
        onEnd: () => setState({ messageKey: null, charIndex: 0, isSpeaking: false }),
      });
    },
    [state.isSpeaking, state.messageKey, stop],
  );

  return {
    supported,
    state,
    speakMessage,
    stop,
    isSpeakingMessage: (messageKey: string) =>
      state.isSpeaking && state.messageKey === messageKey,
  };
}
