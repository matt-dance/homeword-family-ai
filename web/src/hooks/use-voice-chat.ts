"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const MAX_RECORD_MS = 20_000;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export interface UseVoiceChatOptions {
  onTranscript: (text: string) => void;
  readAloudEnabled?: boolean;
}

export function useVoiceChat({ onTranscript, readAloudEnabled = false }: UseVoiceChatOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const readAloudRef = useRef(readAloudEnabled);
  const onTranscriptRef = useRef(onTranscript);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    readAloudRef.current = readAloudEnabled;
  }, [readAloudEnabled]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const hasRecorder = typeof MediaRecorder !== "undefined";
    const hasMic = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasSpeech = typeof window !== "undefined" && Boolean(window.speechSynthesis);

    if (!hasRecorder || !hasMic || !hasSpeech) {
      setVoiceSupported(false);
      return;
    }

    api
      .transcribeStatus()
      .then((status) => setVoiceSupported(status.available))
      .catch(() => setVoiceSupported(false));
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
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

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupStream();
      setListening(false);
    }
  }, [cleanupStream]);

  const startListening = useCallback(async () => {
    if (!voiceSupported || listening || transcribing) return;

    stopSpeaking();
    setSpeechError(null);

    const mimeType = pickMimeType();
    if (!mimeType) {
      setSpeechError("This browser cannot record audio. Try Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setListening(false);
        const recordedChunks = [...chunksRef.current];
        cleanupStream();

        const blob = new Blob(recordedChunks, { type: mimeType });
        if (!blob.size) {
          setSpeechError("I didn't hear anything — tap the mic and speak clearly.");
          return;
        }

        setTranscribing(true);
        setSpeechError(null);
        try {
          const result = await api.transcribeAudio(blob);
          if (result.text) {
            onTranscriptRef.current(result.text);
          } else {
            setSpeechError("Could not make out any words. Try again.");
          }
        } catch (e) {
          setSpeechError(
            e instanceof Error ? e.message : "Could not understand that. Try again or type instead.",
          );
        } finally {
          setTranscribing(false);
        }
      };

      recorder.onerror = () => {
        setListening(false);
        cleanupStream();
        setSpeechError("Could not record audio. Try again.");
      };

      recorder.start(250);
      setListening(true);

      stopTimerRef.current = window.setTimeout(() => {
        stopListening();
      }, MAX_RECORD_MS);
    } catch {
      cleanupStream();
      setListening(false);
      setSpeechError("Microphone access was blocked. Ask a parent to allow the mic in browser settings.");
    }
  }, [voiceSupported, listening, transcribing, stopSpeaking, cleanupStream, stopListening]);

  const toggleListening = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      void startListening();
    }
  }, [listening, startListening, stopListening]);

  useEffect(
    () => () => {
      stopListening();
      stopSpeaking();
      cleanupStream();
    },
    [stopListening, stopSpeaking, cleanupStream],
  );

  return {
    listening,
    speaking,
    transcribing,
    voiceSupported,
    speechError,
    toggleListening,
    speak,
    stopSpeaking,
  };
}
