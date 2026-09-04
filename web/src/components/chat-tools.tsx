"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardShell } from "@/components/chat-tool-shell";
import { QuizCard } from "@/components/quiz-card";
import { TimerCard } from "@/components/timer-card";
import { StoryCard } from "@/components/story-card";
import type {
  AskParentTool,
  ChatTool,
  ClockTool,
  ConvertTool,
  DefineTool,
  FactsTool,
  HowToTool,
  LookupTool,
  MathTool,
  PracticeTool,
  RiddleTool,
} from "@/lib/chat-tools";
import {
  ArrowRightLeft,
  BookOpen,
  Calculator,
  CheckCircle2,
  Circle,
  Clock3,
  CloudSun,
  Eye,
  EyeOff,
  Globe,
  Lightbulb,
  ListChecks,
  Newspaper,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";

export function ChatToolCards({
  tools,
  onSend,
  onSpeak,
  speakSupported,
  isSpeaking,
  speakLoading,
  onStoryPageText,
}: {
  tools: ChatTool[];
  onSend?: (message: string) => void;
  onSpeak?: (text: string) => void;
  speakSupported?: boolean;
  isSpeaking?: boolean;
  speakLoading?: boolean;
  onStoryPageText?: (text: string) => void;
}) {
  if (!tools.length) return null;
  return (
    <div className="space-y-3 pt-1 animate-slide-up">
      {tools.map((tool, i) => (
        <div key={`${tool.type}-${i}`}>
          {tool.type === "math" && <MathCard tool={tool} />}
          {tool.type === "timer" && <TimerCard tool={tool} />}
          {tool.type === "clock" && <ClockCard tool={tool} />}
          {tool.type === "define" && <DefineCard tool={tool} />}
          {tool.type === "quiz" && <QuizCard tool={tool} />}
          {tool.type === "facts" && <FactsCard tool={tool} />}
          {tool.type === "lookup" && <LookupCard tool={tool} />}
          {tool.type === "story" && (
            <StoryCard
              tool={tool}
              onSend={onSend}
              onSpeak={onSpeak}
              speakSupported={speakSupported}
              isSpeaking={isSpeaking}
              speakLoading={speakLoading}
              onPageText={onStoryPageText}
            />
          )}
          {tool.type === "riddle" && <RiddleCard tool={tool} />}
          {tool.type === "convert" && <ConvertCard tool={tool} />}
          {tool.type === "practice" && <PracticeCard tool={tool} />}
          {tool.type === "ask_parent" && <AskParentCard tool={tool} />}
          {tool.type === "howto" && <HowToCard tool={tool} />}
        </div>
      ))}
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

function ClockCard({ tool }: { tool: ClockTool }) {
  return (
    <CardShell
      icon={<Clock3 className="h-4 w-4" />}
      title="Current time"
      badge={tool.timezone || "Local time"}
    >
      <div className="py-1 text-center space-y-1">
        <p className="font-mono text-3xl sm:text-4xl font-extrabold tabular-nums tracking-tight text-foreground">
          {tool.time}
        </p>
        <p className="text-sm sm:text-base text-muted-foreground">{tool.date}</p>
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

function RiddleCard({ tool }: { tool: RiddleTool }) {
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <CardShell
      icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
      title="Riddle"
      badge={showAnswer ? "Revealed" : "Think…"}
    >
      <p className="text-base sm:text-lg font-semibold text-foreground leading-relaxed">
        {tool.riddle}
      </p>
      {tool.hint && (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-xl"
            onClick={() => setShowHint((v) => !v)}
          >
            {showHint ? "Hide hint" : "Need a hint?"}
          </Button>
          {showHint && (
            <p className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-foreground/90">
              {tool.hint}
            </p>
          )}
        </div>
      )}
      <Button
        size="sm"
        variant={showAnswer ? "outline" : "default"}
        className="rounded-xl"
        onClick={() => setShowAnswer((v) => !v)}
      >
        {showAnswer ? (
          <>
            <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            Hide answer
          </>
        ) : (
          <>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Show answer
          </>
        )}
      </Button>
      {showAnswer && (
        <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100 animate-pop-in">
          {tool.answer}
        </p>
      )}
    </CardShell>
  );
}

function ConvertCard({ tool }: { tool: ConvertTool }) {
  return (
    <CardShell
      icon={<ArrowRightLeft className="h-4 w-4" />}
      title="Unit conversion"
      badge="Local math"
    >
      <div className="flex items-center justify-between gap-3 rounded-xl bg-background/90 p-3.5 border border-border/60">
        <span className="text-sm sm:text-base font-medium text-muted-foreground">
          {tool.from_amount} {tool.from_unit}
        </span>
        <span className="text-xl sm:text-2xl font-bold text-primary font-mono">
          = {tool.result} {tool.to_unit}
        </span>
      </div>
    </CardShell>
  );
}

function PracticeCard({ tool }: { tool: PracticeTool }) {
  const items = Array.isArray(tool.items) ? tool.items : [];
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [marks, setMarks] = useState<Record<number, "yes" | "no">>({});
  const scored = Object.keys(marks).length;
  const correct = Object.values(marks).filter((m) => m === "yes").length;

  return (
    <CardShell
      icon={<ListChecks className="h-4 w-4" />}
      title={tool.title || "Practice"}
      badge={tool.kind === "spelling" ? "Spelling" : tool.kind === "times" ? "Times tables" : "Practice"}
    >
      <ol className="space-y-2">
        {items.map((item, idx) => {
          const open = revealed[idx];
          const mark = marks[idx];
          return (
            <li key={`${idx}-${item.prompt}`} className="rounded-xl border border-border/60 bg-background/80 p-3 space-y-2">
              <button
                type="button"
                className="w-full text-left text-sm sm:text-base font-semibold text-foreground"
                onClick={() => setRevealed((prev) => ({ ...prev, [idx]: !prev[idx] }))}
              >
                {item.prompt}
              </button>
              {open && (
                <div className="space-y-2 animate-pop-in">
                  <p className="text-sm text-primary font-semibold">{item.answer}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={mark === "yes" ? "default" : "outline"}
                      className="rounded-xl"
                      onClick={() => setMarks((prev) => ({ ...prev, [idx]: "yes" }))}
                    >
                      I got it
                    </Button>
                    <Button
                      size="sm"
                      variant={mark === "no" ? "destructive" : "ghost"}
                      className="rounded-xl"
                      onClick={() => setMarks((prev) => ({ ...prev, [idx]: "no" }))}
                    >
                      Not yet
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {scored > 0 && (
        <p className="text-xs font-medium text-muted-foreground">
          Score: {correct} / {items.length}
        </p>
      )}
    </CardShell>
  );
}

function AskParentCard({ tool }: { tool: AskParentTool }) {
  return (
    <CardShell
      icon={<Users className="h-4 w-4" />}
      title={tool.title || "Ask a grown-up"}
      badge="Parent help"
      className="border-amber-500/30 bg-amber-500/5"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm sm:text-base text-foreground leading-relaxed">{tool.message}</p>
      </div>
    </CardShell>
  );
}

function HowToCard({ tool }: { tool: HowToTool }) {
  const steps = Array.isArray(tool.steps) ? tool.steps : [];
  const [done, setDone] = useState<Record<number, boolean>>({});
  const finished = steps.length > 0 && steps.every((_, i) => done[i]);

  return (
    <CardShell
      icon={<ListChecks className="h-4 w-4" />}
      title={tool.title || "How to"}
      badge={finished ? "Done!" : `${Object.values(done).filter(Boolean).length}/${steps.length}`}
    >
      <ol className="space-y-2">
        {steps.map((step, idx) => {
          const checked = !!done[idx];
          return (
            <li key={`${idx}-${step}`}>
              <button
                type="button"
                onClick={() => setDone((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm sm:text-base transition-all ${
                  checked
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                    : "border-border/60 bg-background/80 text-foreground"
                }`}
              >
                {checked ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className={checked ? "line-through opacity-80" : ""}>
                  <span className="font-semibold mr-1.5">{idx + 1}.</span>
                  {step}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </CardShell>
  );
}
