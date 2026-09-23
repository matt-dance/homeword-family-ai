"use client";

import { useEffect, useState } from "react";
import {
  dismissAddToHomeScreen,
  hasDismissedAddToHomeScreen,
  shouldPromptAddToHomeScreenAfterJoin,
} from "@/lib/add-to-home-screen";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export function AddToHomeScreenPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (hasDismissedAddToHomeScreen()) return;
    if (!shouldPromptAddToHomeScreenAfterJoin()) return;
    setShow(true);
  }, []);

  if (!show) return null;

  const continueToChat = () => {
    dismissAddToHomeScreen();
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
          <Home className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">You&apos;re in</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Add Homeward to your Home Screen so you can open chat without scanning again. On iPhone or iPad, tap Share →
          Add to Home Screen. On Android, use the browser menu.
        </p>
        <Button onClick={continueToChat} className="w-full h-11 rounded-xl font-semibold">
          Continue to chat
        </Button>
      </div>
    </div>
  );
}
