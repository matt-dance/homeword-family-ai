"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LockKeyhole, ShieldCheck, ArrowRight } from "lucide-react";

interface ParentLockOverlayProps {
  onUnlock: () => void;
}

export function ParentLockOverlay({ onUnlock }: ParentLockOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!password) return;
    setSubmitting(true);
    setError("");
    try {
      await api.login(password);
      onUnlock();
      setPassword("");
    } catch {
      setError("That password doesn't match. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-fade-in">
      <Card className="w-full max-w-sm border-border/80 bg-card/95 shadow-2xl rounded-2xl animate-pop-in">
        <CardContent className="pt-8 pb-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Parent Area Locked
            </h2>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              This computer has been idle. Enter your parent password to continue.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <Input
              type="password"
              placeholder="Parent password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="h-12 rounded-xl text-center text-base"
              autoFocus
            />
            {error && (
              <p className="text-xs font-semibold text-destructive text-center animate-slide-down">
                {error}
              </p>
            )}
          </div>

          <Button
            className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
            onClick={handleSubmit}
            disabled={submitting || !password}
          >
            {submitting ? "Unlocking…" : "Unlock Dashboard"}
            {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Local privacy protection active</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
