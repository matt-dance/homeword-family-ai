"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardShell } from "@/components/chat-tool-shell";
import type { TimerTool } from "@/lib/chat-tools";
import { Pause, Play, RotateCcw, Sparkles, TimerReset } from "lucide-react";

export function playTimerDing() {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;
  const beep = (start: number, frequency: number, duration: number) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };
  beep(now, 880, 0.18);
  beep(now + 0.2, 1174, 0.22);
  window.setTimeout(() => {
    void ctx.close();
  }, 700);
}

export function TimerCard({ tool }: { tool: TimerTool }) {
  const total = Math.max(1, tool.seconds || 0);
  const [left, setLeft] = useState(tool.seconds);
  const [running, setRunning] = useState(true);
  const dingedRef = useRef(false);

  useEffect(() => {
    setLeft(tool.seconds);
    setRunning(true);
    dingedRef.current = false;
  }, [tool.seconds]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, tool.seconds]);

  useEffect(() => {
    if (left !== 0 || dingedRef.current) return;
    dingedRef.current = true;
    try {
      playTimerDing();
    } catch {
      /* browsers may block audio until a tap */
    }
  }, [left]);

  const label = useMemo(() => {
    const m = Math.floor(Math.max(0, left) / 60);
    const s = Math.max(0, left) % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [left]);

  const progress = Math.max(0, Math.min(100, ((total - left) / total) * 100));
  const isDone = left === 0;

  return (
    <CardShell
      icon={<TimerReset className="h-4 w-4" />}
      title={`Timer · ${tool.label}`}
      badge={isDone ? "Completed" : running ? "Running" : "Paused"}
      className={isDone ? "border-emerald-500/40 bg-emerald-500/5" : ""}
    >
      <div className="py-2 text-center space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-300 ${
              isDone ? "bg-emerald-500" : "bg-gradient-to-r from-primary to-indigo-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {isDone ? (
          <div className="space-y-1 py-1 animate-bounce-gentle">
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2">
              <Sparkles className="h-7 w-7 text-amber-400" />
              Time&apos;s up! 🎉
            </p>
            <p className="text-xs text-muted-foreground">Great job staying on task!</p>
          </div>
        ) : (
          <p className="font-mono text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight text-foreground">
            {label}
          </p>
        )}

        <div className="flex justify-center gap-2.5 pt-1">
          <Button
            size="sm"
            variant={running ? "outline" : "default"}
            onClick={() => setRunning((v) => !v)}
            disabled={isDone}
            className="rounded-xl px-4 font-medium shadow-xs"
          >
            {running ? (
              <>
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Start
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dingedRef.current = false;
              setLeft(tool.seconds);
              setRunning(true);
            }}
            className="rounded-xl px-3 font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>
    </CardShell>
  );
}
