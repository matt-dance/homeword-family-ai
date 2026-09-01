"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  ChatTool,
  DefineTool,
  FactsTool,
  LookupTool,
  MathTool,
  QuizTool,
  TimerTool,
} from "@/lib/chat-tools";
import {
  BookOpen,
  Calculator,
  Check,
  CheckCircle2,
  CloudSun,
  Globe,
  HelpCircle,
  Lightbulb,
  Newspaper,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  TimerReset,
  Trophy,
  XCircle,
} from "lucide-react";

export function ChatToolCards({ tools }: { tools: ChatTool[] }) {
  if (!tools.length) return null;
  return (
    <div className="space-y-3 pt-1 animate-slide-up">
      {tools.map((tool, i) => (
        <div key={`${tool.type}-${i}`}>
          {tool.type === "math" && <MathCard tool={tool} />}
          {tool.type === "timer" && <TimerCard tool={tool} />}
          {tool.type === "define" && <DefineCard tool={tool} />}
          {tool.type === "quiz" && <QuizCard tool={tool} />}
          {tool.type === "facts" && <FactsCard tool={tool} />}
          {tool.type === "lookup" && <LookupCard tool={tool} />}
        </div>
      ))}
    </div>
  );
}

function CardShell({
  icon,
  title,
  badge,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-primary/25 bg-gradient-to-br from-card to-primary/5 p-4 sm:p-5 shadow-sm space-y-3.5 transition-all ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2.5 font-semibold text-foreground text-sm sm:text-base">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <span>{title}</span>
        </div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function MathCard({ tool }: { tool: MathTool }) {
  return (
    <CardShell
      icon={<Calculator className="h-4 w-4" />}
      title="Step-by-step Math"
      badge="Calculator"
    >
      <div className="flex items-center justify-between rounded-xl bg-background/90 p-3.5 border border-border/60">
        <span className="text-base sm:text-lg font-mono font-medium text-muted-foreground">
          {tool.expression}
        </span>
        <span className="text-xl sm:text-2xl font-bold text-primary font-mono">
          = {tool.result}
        </span>
      </div>
      {tool.steps?.length ? (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How we solved it:
          </p>
          <ol className="space-y-1 text-sm">
            {tool.steps.map((step, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 font-mono text-xs sm:text-sm text-foreground/90"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </CardShell>
  );
}

function TimerCard({ tool }: { tool: TimerTool }) {
  const [left, setLeft] = useState(tool.seconds);
  const [running, setRunning] = useState(true);

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
  }, [running]);

  const label = useMemo(() => {
    const m = Math.floor(left / 60);
    const s = left % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [left]);

  const progress = Math.max(0, Math.min(100, ((tool.seconds - left) / tool.seconds) * 100));
  const isDone = left === 0;

  return (
    <CardShell
      icon={<TimerReset className="h-4 w-4" />}
      title={`Timer · ${tool.label}`}
      badge={isDone ? "Completed" : running ? "Running" : "Paused"}
      className={isDone ? "border-emerald-500/40 bg-emerald-500/5" : ""}
    >
      <div className="py-2 text-center space-y-3">
        {/* Progress bar */}
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

function DefineCard({ tool }: { tool: DefineTool }) {
  return (
    <CardShell
      icon={<BookOpen className="h-4 w-4" />}
      title="Word Definition"
      badge="Vocabulary"
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-background/90 p-4 border border-border/60">
          <h4 className="text-xl font-bold text-primary tracking-tight capitalize">
            {tool.word}
          </h4>
          <p className="mt-1.5 text-sm sm:text-base text-foreground leading-relaxed">
            {tool.meaning}
          </p>
        </div>
        {tool.example && (
          <div className="rounded-lg bg-muted/60 p-3 border-l-2 border-primary text-xs sm:text-sm text-foreground/90 italic">
            <span className="font-semibold not-italic text-muted-foreground mr-1.5">Example:</span>
            &ldquo;{tool.example}&rdquo;
          </div>
        )}
      </div>
    </CardShell>
  );
}

function FactsCard({ tool }: { tool: FactsTool }) {
  return (
    <CardShell
      icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
      title={`Fun Facts · ${tool.topic}`}
      badge="Did you know?"
    >
      <ol className="space-y-2.5">
        {(tool.facts ?? []).map((fact, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 rounded-xl bg-background/80 p-3.5 border border-border/50 text-sm sm:text-base leading-relaxed"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-600 dark:text-amber-400">
              {idx + 1}
            </span>
            <span className="text-foreground/95">{fact}</span>
          </li>
        ))}
      </ol>
    </CardShell>
  );
}

function lookupTitle(kind: string): string {
  if (kind === "weather") return "Looked up the weather";
  if (kind === "sports") return "Looked up the score";
  if (kind === "news") return "Looked up current events";
  return "Looked this up";
}

function lookupIcon(kind: string) {
  if (kind === "weather") return <CloudSun className="h-4 w-4" />;
  if (kind === "sports") return <Trophy className="h-4 w-4" />;
  if (kind === "news") return <Newspaper className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
}

function LookupCard({ tool }: { tool: LookupTool }) {
  return (
    <CardShell
      icon={lookupIcon(tool.kind)}
      title={lookupTitle(tool.kind)}
      badge={tool.source_label || "Named source"}
    >
      <div className="space-y-2.5">
        {tool.query && (
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Asked about {tool.query}
          </p>
        )}
        <p className="text-sm sm:text-base text-foreground leading-relaxed">
          {tool.summary}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Checked a named source — not a generic web search.
        </p>
      </div>
    </CardShell>
  );
}

function QuizCard({ tool }: { tool: QuizTool }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const questions = Array.isArray(tool.questions) ? tool.questions : [];
  const question = questions[index];
  if (!question) return null;

  const correct = picked !== null && picked === question.answer;
  const last = index === questions.length - 1;

  return (
    <CardShell
      icon={<HelpCircle className="h-4 w-4 text-primary" />}
      title={tool.title || "Quick Quiz"}
      badge={`Question ${index + 1} of ${questions.length}`}
    >
      <div className="space-y-3.5">
        <p className="text-base sm:text-lg font-semibold text-foreground">
          {question.q}
        </p>
        <div className="space-y-2">
          {(question.choices ?? []).map((choice, i) => {
            const show = picked !== null;
            const isAnswer = i === question.answer;
            const isPicked = picked === i;

            let buttonStyle = "border-border/80 bg-background hover:bg-muted/70";
            if (show && isAnswer) {
              buttonStyle = "border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 font-semibold shadow-xs";
            } else if (show && isPicked && !isAnswer) {
              buttonStyle = "border-destructive/70 bg-destructive/10 text-destructive";
            }

            return (
              <Button
                key={`${i}-${choice}`}
                variant="outline"
                className={`w-full justify-between h-auto py-3 px-4 rounded-xl text-left whitespace-normal text-sm sm:text-base transition-all ${buttonStyle}`}
                disabled={picked !== null}
                onClick={() => setPicked(i)}
              >
                <span>{choice}</span>
                {show && isAnswer && (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-2" />
                )}
                {show && isPicked && !isAnswer && (
                  <XCircle className="h-4 w-4 text-destructive shrink-0 ml-2" />
                )}
              </Button>
            );
          })}
        </div>

        {picked !== null && (
          <div
            className={`rounded-xl p-3.5 border text-sm animate-pop-in ${
              correct
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            }`}
          >
            <p className="font-semibold">{correct ? "🎉 Great job!" : "💡 Not quite!"}</p>
            {question.explain && (
              <p className="mt-1 text-xs sm:text-sm text-foreground/90">{question.explain}</p>
            )}
          </div>
        )}

        {picked !== null && !last && (
          <Button
            size="sm"
            onClick={() => {
              setIndex((n) => n + 1);
              setPicked(null);
            }}
            className="rounded-xl font-medium shadow-xs"
          >
            Next question →
          </Button>
        )}
      </div>
    </CardShell>
  );
}
