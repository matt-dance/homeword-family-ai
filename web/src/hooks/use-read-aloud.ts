"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createReadAloudController, type ReadAloudState } from "@/lib/read-aloud";

export function useReadAloud() {
  const controllerRef = useRef(createReadAloudController((text) => api.speakText(text)));
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ReadAloudState>({
    messageKey: null,
    isSpeaking: false,
    isLoading: false,
  });

  useEffect(() => {
    const controller = controllerRef.current;
    api
      .speakStatus()
      .then((status) => setSupported(status.available))
      .catch(() => setSupported(false));
    return () => controller.dispose();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current.stop();
    setState({ messageKey: null, isSpeaking: false, isLoading: false });
    setError(null);
  }, []);

  const speakMessage = useCallback(
    (messageKey: string, text: string) => {
      if (!text.trim()) return;

      setError(null);

      if (state.isSpeaking && state.messageKey === messageKey) {
        stop();
        return;
      }

      stop();
      setState({ messageKey, isSpeaking: false, isLoading: true });

      void controllerRef.current.speak(text, {
        onStart: () => setState({ messageKey, isSpeaking: true, isLoading: false }),
        onEnd: () => setState({ messageKey: null, isSpeaking: false, isLoading: false }),
        onError: (message) => {
          setError(message);
          setState({ messageKey: null, isSpeaking: false, isLoading: false });
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
      (state.isSpeaking || state.isLoading) && state.messageKey === messageKey,
  };
}
