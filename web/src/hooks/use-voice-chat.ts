"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const MAX_RECORD_MS = 20_000;
const SILENCE_THRESHOLD = 0.018;
const SILENCE_DURATION_MS = 1300;
const INITIAL_GRACE_MS = 700;
const MIN_RECORD_BEFORE_STOP_MS = 500;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitSpeechRecognition?: new () => SpeechRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function measureRms(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = (buffer[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / buffer.length);
}

export interface UseVoiceChatOptions {
  onTranscript: (text: string) => void;
  onListeningStart?: () => void;
}

export function useVoiceChat({ onTranscript, onListeningStart }: UseVoiceChatOptions) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [heardSpeech, setHeardSpeech] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const onListeningStartRef = useRef(onListeningStart);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const vadStateRef = useRef({ speechDetected: false, lastSpeechAt: 0, startedAt: 0 });
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const stopListeningRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onListeningStartRef.current = onListeningStart;
  }, [onListeningStart]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const hasRecorder = typeof MediaRecorder !== "undefined";
    const hasMic = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

    if (!hasRecorder || !hasMic) {
      setVoiceSupported(false);
      return;
    }

    api
      .transcribeStatus()
      .then((status) => setVoiceSupported(status.available))
      .catch(() => setVoiceSupported(false));
  }, []);

  const stopVad = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
    setInterimTranscript("");
    setHeardSpeech(false);
    vadStateRef.current = { speechDetected: false, lastSpeechAt: 0, startedAt: 0 };
  }, []);

  const stopPreviewRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
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
    stopVad();
    stopPreviewRecognition();
  }, [stopVad, stopPreviewRecognition]);

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupStream();
      setListening(false);
    }
  }, [cleanupStream]);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  const startPreviewRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    try {
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) final += piece;
          else interim += piece;
        }
        const preview = (final + interim).trim();
        if (preview) {
          setInterimTranscript(preview);
          setHeardSpeech(true);
        }
      };

      recognition.onerror = () => {
        /* Preview only — Whisper handles the real transcript. */
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition && recorderRef.current?.state === "recording") {
          try {
            recognition.start();
          } catch {
            /* ignore restart errors */
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      /* Preview unavailable in this browser — audio bars still work. */
    }
  }, []);

  const startVad = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    vadStateRef.current = {
      speechDetected: false,
      lastSpeechAt: Date.now(),
      startedAt: Date.now(),
    };

    const buffer = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;

    const tick = () => {
      const activeAnalyser = analyserRef.current;
      if (!activeAnalyser) return;

      const rms = measureRms(activeAnalyser, buffer);
      setAudioLevel(Math.min(1, rms * 5));

      const now = Date.now();
      const state = vadStateRef.current;

      if (rms > SILENCE_THRESHOLD) {
        state.speechDetected = true;
        state.lastSpeechAt = now;
        setHeardSpeech(true);
      } else if (
        state.speechDetected &&
        now - state.startedAt > INITIAL_GRACE_MS &&
        now - state.startedAt > MIN_RECORD_BEFORE_STOP_MS &&
        now - state.lastSpeechAt > SILENCE_DURATION_MS
      ) {
        stopListeningRef.current();
        return;
      }

      vadFrameRef.current = requestAnimationFrame(tick);
    };

    vadFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const startListening = useCallback(async () => {
    if (!voiceSupported || listening || transcribing) return;

    onListeningStartRef.current?.();
    setSpeechError(null);
    setInterimTranscript("");
    setHeardSpeech(false);

    const mimeType = pickMimeType();
    if (!mimeType) {
      setSpeechError("This browser cannot record audio. Try Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
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
      startVad(stream);
      startPreviewRecognition();

      stopTimerRef.current = window.setTimeout(() => {
        stopListening();
      }, MAX_RECORD_MS);
    } catch {
      cleanupStream();
      setListening(false);
      setSpeechError("Microphone access was blocked. Ask a parent to allow the mic in browser settings.");
    }
  }, [
    voiceSupported,
    listening,
    transcribing,
    cleanupStream,
    stopListening,
    startVad,
    startPreviewRecognition,
  ]);

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
      cleanupStream();
    },
    [stopListening, cleanupStream],
  );

  return {
    listening,
    transcribing,
    voiceSupported,
    speechError,
    audioLevel,
    interimTranscript,
    heardSpeech,
    toggleListening,
  };
}
