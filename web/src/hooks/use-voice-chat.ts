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

function errorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
      return "Microphone access was blocked. Ask a parent to allow the mic in browser settings.";
    case "no-speech":
      return "I didn't hear anything — tap the mic and speak clearly.";
    case "network":
      return "Voice typing needs an internet connection in Chrome. You can type instead.";
    case "audio-capture":
      return "No microphone found. Check your device settings or try typing.";
    case "service-not-allowed":
      return "Voice is not available in this browser tab. Try Chrome or Edge.";
    default:
      return "Could not hear you. Tap the mic and try again.";
  }
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
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    readAloudRef.current = readAloudEnabled;
  }, [readAloudEnabled]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const Recognition = getSpeechRecognition();
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    setVoiceSupported(Boolean(Recognition && synth));
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
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
  }, []);

  const startListening = useCallback(async () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setSpeechError("Voice is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (recognitionRef.current) {
      stopListening();
      return;
    }

    stopSpeaking();
    setSpeechError(null);

    // Warm up mic permission so SpeechRecognition is not rejected instantly.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setSpeechError("Microphone access was blocked. Ask a parent to allow the mic in browser settings.");
        return;
      }
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let gotResult = false;

    recognition.onstart = () => {
      setListening(true);
      setSpeechError(null);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      if (gotResult) return;
      const message = errorMessage(event.error);
      if (message) setSpeechError(message);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      transcript = transcript.trim();
      if (!transcript) return;

      gotResult = true;
      setSpeechError(null);
      onTranscriptRef.current(transcript);
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setSpeechError("Could not start the microphone. Tap again in a moment.");
    }
  }, [stopListening, stopSpeaking]);

  const toggleListening = useCallback(() => {
    if (listening || recognitionRef.current) {
      stopListening();
    } else {
      void startListening();
    }
  }, [listening, startListening, stopListening]);

  useEffect(
    () => () => {
      stopListening();
      stopSpeaking();
    },
    [stopListening, stopSpeaking],
  );

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
