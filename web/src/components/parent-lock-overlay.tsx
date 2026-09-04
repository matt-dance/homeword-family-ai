"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LockKeyhole, ShieldCheck, ArrowRight } from "lucide-react";

export interface ParentLockOverlayProps {
  onUnlock: () => void;
  /** Optional dismiss — used when the overlay is a one-off challenge (homework camera). */
  onCancel?: () => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  submittingLabel?: string;
  /** Return a custom error, or null/empty to keep the default mismatch copy. */
  mapError?: (message: string) => string | null | undefined;
}

export function ParentLockOverlay({
  onUnlock,
  onCancel,
  title = "Parent Area Locked",
  description = "This computer has been idle. Enter your parent password to continue.",
  submitLabel = "Unlock Dashboard",
  submittingLabel = "Unlocking…",
  mapError,
}: ParentLockOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError("");
    try {
      await api.login(password);
      onUnlock();
      setPassword("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const mapped = mapError?.(message);
      if (mapped) {
        setError(mapped);
      } else if (!message || message === "Invalid password" || message === "Request failed") {
        setError("That password doesn't match. Please try again.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-lock-title"
    >
      <Card className="w-full max-w-sm border-border/80 bg-card/95 shadow-2xl rounded-2xl animate-pop-in">
        <CardContent className="pt-8 pb-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <h2 id="parent-lock-title" className="text-xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {description}
            </p>
          </div>

          <form className="space-y-2 pt-1" onSubmit={handleSubmit}>
            <Input
              type="password"
              placeholder="Parent password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl text-center text-base"
              autoFocus
              autoComplete="current-password"
            />
            {error && (
              <p className="text-xs font-semibold text-destructive text-center animate-slide-down">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
              disabled={submitting || !password}
            >
              {submitting ? submittingLabel : submitLabel}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>

          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 rounded-xl text-muted-foreground"
              onClick={onCancel}
              disabled={submitting}
            >
              Not now
            </Button>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Local privacy protection active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
