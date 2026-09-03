"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardShell } from "@/components/chat-tool-shell";
import type { QuizTool } from "@/lib/chat-tools";
import { Check, HelpCircle, Trophy, XCircle } from "lucide-react";

export function QuizCard({ tool }: { tool: QuizTool }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const questions = Array.isArray(tool.questions) ? tool.questions : [];
  const question = questions[index];
  if (!question && !finished) return null;

  const correct = picked !== null && picked === question?.answer;
  const last = index === questions.length - 1;

  if (finished) {
    return (
      <CardShell
        icon={<Trophy className="h-4 w-4 text-amber-500" />}
        title={tool.title || "Quick Quiz"}
        badge="Finished"
        className="border-amber-500/30 bg-amber-500/5"
      >
        <div className="space-y-2 py-2 text-center">
          <p className="text-2xl font-extrabold text-foreground">
            {score} / {questions.length}
          </p>
          <p className="text-sm text-muted-foreground">
            {score === questions.length
              ? "Perfect score — you crushed it!"
              : score > questions.length / 2
                ? "Nice work. Want to try another quiz?"
                : "Good try! Ask me to quiz you again."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              setIndex(0);
              setPicked(null);
              setScore(0);
              setFinished(false);
            }}
          >
            Play again
          </Button>
        </div>
      </CardShell>
    );
  }

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
                onClick={() => {
                  setPicked(i);
                  if (i === question.answer) setScore((n) => n + 1);
                }}
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

        {picked !== null && last && (
          <Button
            size="sm"
            onClick={() => setFinished(true)}
            className="rounded-xl font-medium shadow-xs"
          >
            See my score
          </Button>
        )}
      </div>
    </CardShell>
  );
}
