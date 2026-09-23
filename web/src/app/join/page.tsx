"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { hasDismissedAddToHomeScreen, markPromptAddToHomeScreenAfterJoin } from "@/lib/add-to-home-screen";
import { isCompleteHouseCode, normalizeHouseCode, spokenHouseCode } from "@/lib/house-code";
import { HomewardLogo } from "@/components/homeward-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smartphone } from "lucide-react";

function JoinFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Smartphone className="h-8 w-8 animate-pulse text-primary" />
    </div>
  );
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCode = normalizeHouseCode(searchParams?.get("code") ?? "");
  const [code, setCode] = useState(queryCode);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const autoTried = useRef(false);

  const submit = async (digits: string) => {
    const next = normalizeHouseCode(digits);
    if (!isCompleteHouseCode(next)) {
      setError("Enter the 4-digit house code from the Homeward computer.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.joinHouse(next);
      setJoined(true);
      if (!hasDismissedAddToHomeScreen()) {
        markPromptAddToHomeScreenAfterJoin();
      }
      // Go to /chat so Add to Home Screen cannot bookmark /join?code=NNNN.
      router.replace("/chat");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        message && /house code/i.test(message)
          ? message
          : "That house code isn't valid. Use the same Wi‑Fi as the Homeward computer.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (autoTried.current) return;
    if (!isCompleteHouseCode(queryCode)) return;
    autoTried.current = true;
    void submit(queryCode);
    // Auto-join once from the QR query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryCode]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-slate-100 bg-white/90 backdrop-blur-md px-6 py-4 flex items-center justify-between dark:border-border dark:bg-card/90">
        <HomewardLogo showTagline />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex-1 max-w-md w-full p-6 sm:p-10 flex flex-col justify-center animate-fade-in">
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Join this house</h1>
            <p className="text-sm text-muted-foreground">
              Type the 4-digit house code from the Homeward computer. Same Wi‑Fi — not the internet.
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">House code</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={4}
              value={code}
              aria-label={code ? `House code ${spokenHouseCode(code)}` : "House code"}
              onChange={(e) => setCode(normalizeHouseCode(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void submit(code)}
              className="h-14 rounded-xl text-center font-mono text-2xl tracking-[0.4em]"
              placeholder="••••"
              disabled={submitting || joined}
            />
          </label>
          {error && (
            <p className="text-sm font-semibold text-destructive text-center" role="alert">
              {error}
            </p>
          )}
          <Button
            onClick={() => void submit(code)}
            disabled={submitting || !isCompleteHouseCode(code)}
            className="w-full h-11 rounded-xl font-semibold"
          >
            {submitting ? "Joining…" : "Join"}
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<JoinFallback />}>
      <JoinContent />
    </Suspense>
  );
}
