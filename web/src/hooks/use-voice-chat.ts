"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceChatOptions {
  onTranscript: (text: string) => void;
  readAloudEnabled?: boolean;
}

export function useVoiceChat({ onTranscript, readAloudEnabled = false }: UseVoiceChatOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const readAloudRef = useRef(readAloudEnabled);

  useEffect(() => {
    readAloudRef.current = readAloudEnabled;
  }, [readAloudEnabled]);

  useEffect(() => {
    const Recognition = getSpeechRecognition();
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    setVoiceSupported(Boolean(Recognition && synth));

    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setListening(true);
      setSpeechError(null);
    };

    recognition.onend = () => setListening(false);

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "not-allowed") {
        setSpeechError("Microphone access was blocked. Ask a parent to allow the mic in browser settings.");
      } else if (event.error !== "aborted") {
        setSpeechError("Could not hear you. Try again!");
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [onTranscript]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!readAloudRef.current || typeof window === "undefined") return;
      const synth = window.speechSynthesis;
      if (!synth || !text.trim()) return;

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [],
  );

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setSpeechError("Voice is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (listening) {
      recognition.stop();
      return;
    }

    stopSpeaking();
    setSpeechError(null);
    try {
      recognition.start();
    } catch {
      setSpeechError("Could not start the microphone. Try again.");
    }
  }, [listening, stopSpeaking]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  return {
    listening,
    speaking,
    voiceSupported,
    speechError,
    toggleListening,
    speak,
    stopSpeaking,
  };
}
