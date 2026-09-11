"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STREAM_STALL_MESSAGE, reportKidChatStreamFailure } from "@/lib/kid-chat-stream-error";

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null };

/**
 * Catches render exceptions in kid chat so a stalled/bad SSE turn cannot
 * surface Next.js's generic "Application error" page.
 */
export class KidChatErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportKidChatStreamFailure(error, "kid-chat-error-boundary");
    console.error("[homeward] kid-chat component stack", info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50/90 px-4 py-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <Moon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{STREAM_STALL_MESSAGE}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="rounded-xl"
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
