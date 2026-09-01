"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LockKeyhole } from "lucide-react";

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
      setError("That password doesn't match. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-8 pb-6 space-y-4">
          <div className="text-center">
            <LockKeyhole className="mx-auto h-10 w-10 text-primary mb-3" />
            <h2 className="text-xl font-bold">Parent area locked</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Enter your parent password to view the dashboard.
            </p>
          </div>
          <Input
            type="password"
            placeholder="Parent password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleSubmit} disabled={submitting || !password}>
            Unlock
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
