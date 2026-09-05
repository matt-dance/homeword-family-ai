"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const MAX_RECORD_MS = 20_000;
const SILENCE_THRESHOLD = 0.018;
const SILENCE_DURATION_MS = 1300;
const INITIAL_GRACE_MS = 700;
const MIN_RECORD_BEFORE_STOP_MS = 500;
const BARGE_IN_THRESHOLD = 0.055;
const BARGE_IN_HOLD_MS = 350;
const BARGE_IN_GRACE_MS = 500;

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
  /** Return true if the empty result was handled (e.g. conversation retry). */
  onTranscriptEmpty?: () => boolean | void;
  onError?: () => void;
}

export function useVoiceChat({
  onTranscript,
  onListeningStart,
  onTranscriptEmpty,
  onError,
}: UseVoiceChatOptions) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [heardSpeech, setHeardSpeech] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const onListeningStartRef = useRef(onListeningStart);
  const onTranscriptEmptyRef = useRef(onTranscriptEmpty);
  const onErrorRef = useRef(onError);
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
  const bargeStreamRef = useRef<MediaStream | null>(null);
  const bargeContextRef = useRef<AudioContext | null>(null);
  const bargeFrameRef = useRef<number | null>(null);
  const bargeCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onListeningStartRef.current = onListeningStart;
  }, [onListeningStart]);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onTranscriptEmptyRef.current = onTranscriptEmpty;
  }, [onTranscriptEmpty]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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

  const stopBargeInWatch = useCallback(() => {
    if (bargeFrameRef.current) {
      cancelAnimationFrame(bargeFrameRef.current);
      bargeFrameRef.current = null;
    }
    bargeCallbackRef.current = null;
    bargeStreamRef.current?.getTracks().forEach((track) => track.stop());
    bargeStreamRef.current = null;
    if (bargeContextRef.current) {
      void bargeContextRef.current.close();
      bargeContextRef.current = null;
    }
  }, []);

  const startBargeInWatch = useCallback(
    async (onSpeech: () => void): Promise<boolean> => {
      stopBargeInWatch();
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return false;
      }
      bargeCallbackRef.current = onSpeech;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        bargeStreamRef.current = stream;
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        bargeContextRef.current = audioContext;

        const buffer = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
        const startedAt = Date.now();
        let speechStartedAt: number | null = null;

        const tick = () => {
          if (!bargeCallbackRef.current) return;
          const rms = measureRms(analyser, buffer);
          const now = Date.now();
          if (now - startedAt < BARGE_IN_GRACE_MS) {
            bargeFrameRef.current = requestAnimationFrame(tick);
            return;
          }
          if (rms > BARGE_IN_THRESHOLD) {
            if (speechStartedAt == null) speechStartedAt = now;
            if (now - speechStartedAt >= BARGE_IN_HOLD_MS) {
              const cb = bargeCallbackRef.current;
              stopBargeInWatch();
              cb?.();
              return;
            }
          } else {
            speechStartedAt = null;
          }
          bargeFrameRef.current = requestAnimationFrame(tick);
        };
        bargeFrameRef.current = requestAnimationFrame(tick);
        return true;
      } catch {
        stopBargeInWatch();
        return false;
      }
    },
    [stopBargeInWatch],
  );

  const startListening = useCallback(async () => {
    if (!voiceSupported || listening || transcribing) return;
    stopBargeInWatch();

    onListeningStartRef.current?.();
    setSpeechError(null);
    setInterimTranscript("");
    setHeardSpeech(false);

    const mimeType = pickMimeType();
    if (!mimeType) {
      setSpeechError("This browser cannot record audio. Try Chrome or Edge.");
      onErrorRef.current?.();
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
          const handled = onTranscriptEmptyRef.current?.();
          if (!handled) {
            setSpeechError("I didn't hear anything — tap the mic and speak clearly.");
          }
          return;
        }

        setTranscribing(true);
        setSpeechError(null);
        try {
          const result = await api.transcribeAudio(blob);
          if (result.text) {
            onTranscriptRef.current(result.text);
          } else {
            const handled = onTranscriptEmptyRef.current?.();
            if (!handled) {
              setSpeechError("Could not make out any words. Try again.");
            }
          }
        } catch (e) {
          setSpeechError(
            e instanceof Error ? e.message : "Could not understand that. Try again or type instead.",
          );
          onErrorRef.current?.();
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
      onErrorRef.current?.();
    }
  }, [
    voiceSupported,
    listening,
    transcribing,
    cleanupStream,
    stopListening,
    startVad,
    startPreviewRecognition,
    stopBargeInWatch,
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
      stopBargeInWatch();
      stopListening();
      cleanupStream();
    },
    [stopListening, cleanupStream, stopBargeInWatch],
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
    startListening,
    stopListening,
    startBargeInWatch,
    stopBargeInWatch,
  };
}
