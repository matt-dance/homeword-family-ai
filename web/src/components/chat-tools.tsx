"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ChatTool, DefineTool, FactsTool, MathTool, QuizTool, TimerTool } from "@/lib/chat-tools";
import { BookOpen, Calculator, Check, Lightbulb, TimerReset } from "lucide-react";

export function ChatToolCards({ tools }: { tools: ChatTool[] }) {
  if (!tools.length) return null;
  return (
    <div className="space-y-3">
      {tools.map((tool, i) => (
        <div key={`${tool.type}-${i}`}>
          {tool.type === "math" && <MathCard tool={tool} />}
          {tool.type === "timer" && <TimerCard tool={tool} />}
          {tool.type === "define" && <DefineCard tool={tool} />}
          {tool.type === "quiz" && <QuizCard tool={tool} />}
          {tool.type === "facts" && <FactsCard tool={tool} />}
        </div>
      ))}
    </div>
  );
}

function CardShell({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function MathCard({ tool }: { tool: MathTool }) {
  return (
    <CardShell icon={<Calculator className="h-4 w-4" />} title="Calculator">
      <p className="text-lg font-medium">
        {tool.expression} = <span className="text-primary">{tool.result}</span>
      </p>
      {tool.steps?.length ? (
        <ol className="list-decimal ml-5 text-sm text-muted-foreground space-y-1">
          {tool.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
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

  return (
    <CardShell icon={<TimerReset className="h-4 w-4" />} title={`Timer · ${tool.label}`}>
      <p className={`text-center font-semibold tabular-nums ${left === 0 ? "text-primary text-3xl" : "text-4xl"}`}>
        {left === 0 ? "Time's up!" : label}
      </p>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setRunning((v) => !v)} disabled={left === 0}>
          {running ? "Pause" : "Start"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setLeft(tool.seconds);
            setRunning(true);
          }}
        >
          Reset
        </Button>
      </div>
    </CardShell>
  );
}

function DefineCard({ tool }: { tool: DefineTool }) {
  return (
    <CardShell icon={<BookOpen className="h-4 w-4" />} title={tool.word}>
      <p>{tool.meaning}</p>
      {tool.example && <p className="text-sm text-muted-foreground italic">Example: {tool.example}</p>}
    </CardShell>
  );
}

function FactsCard({ tool }: { tool: FactsTool }) {
  return (
    <CardShell icon={<Lightbulb className="h-4 w-4" />} title={`Fun facts · ${tool.topic}`}>
      <ol className="list-decimal ml-5 space-y-2">
        {(tool.facts ?? []).map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ol>
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
    <CardShell icon={<Check className="h-4 w-4" />} title={tool.title || "Quiz"}>
      <p className="text-xs text-muted-foreground">
        Question {index + 1} of {questions.length}
      </p>
      <p className="font-medium">{question.q}</p>
      <div className="space-y-2">
        {(question.choices ?? []).map((choice, i) => {
          const show = picked !== null;
          const isAnswer = i === question.answer;
          return (
            <Button
              key={`${i}-${choice}`}
              variant="outline"
              className={`w-full justify-start h-auto py-3 whitespace-normal ${
                show && isAnswer ? "border-green-500 bg-green-500/10" : ""
              } ${show && picked === i && !isAnswer ? "border-destructive/50 bg-destructive/5" : ""}`}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
            >
              {choice}
            </Button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="text-sm text-muted-foreground">
          {correct ? "Nice!" : "Not quite."} {question.explain}
        </p>
      )}
      {picked !== null && !last && (
        <Button
          size="sm"
          onClick={() => {
            setIndex((n) => n + 1);
            setPicked(null);
          }}
        >
          Next question
        </Button>
      )}
    </CardShell>
  );
}
