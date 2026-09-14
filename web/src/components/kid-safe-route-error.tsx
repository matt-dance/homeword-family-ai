"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Moon, ArrowLeft } from "lucide-react";
import { HomewardLogo } from "@/components/homeward-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { STREAM_STALL_MESSAGE, reportKidChatStreamFailure } from "@/lib/kid-chat-stream-error";

export function KidSafeRouteError({
  error,
  reset,
  reportContext,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  reportContext: string;
}) {
  useEffect(() => {
    reportKidChatStreamFailure(error, reportContext);
  }, [error, reportContext]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex flex-col">
      <header className="border-b border-slate-100 bg-white/90 p-4 flex items-center justify-between dark:border-border dark:bg-card/90">
        <HomewardLogo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-md p-8 text-center flex-1 flex flex-col justify-center animate-pop-in">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <Moon className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Homeward needs a moment</h1>
        <p className="text-muted-foreground text-sm mb-6">{STREAM_STALL_MESSAGE}</p>
        <div className="flex flex-col gap-3">
          <Button className="w-full rounded-xl" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/chat?pick=1">
            <Button variant="outline" className="w-full rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Pick a profile
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
