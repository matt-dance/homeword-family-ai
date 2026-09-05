import { AlertTriangle, Clock, ShieldAlert, Zap } from "lucide-react";
import type { BlockedAttempt } from "@/lib/api";
import {
  describeBlockedAttempt,
  type BlockedCategory,
} from "@/lib/blocked-attempt";

const CATEGORY_CHROME: Record<
  BlockedCategory,
  { card: string; badge: string; quote: string; Icon: typeof ShieldAlert }
> = {
  policy: {
    card: "border-destructive/30 bg-destructive/5",
    badge: "bg-destructive/15 text-destructive",
    quote: "border-destructive/20",
    Icon: ShieldAlert,
  },
  classifier_infra: {
    card: "border-amber-500/30 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
    quote: "border-amber-500/20",
    Icon: Clock,
  },
  llm_error: {
    card: "border-sky-500/30 bg-sky-500/5",
    badge: "bg-sky-500/15 text-sky-800 dark:text-sky-400",
    quote: "border-sky-500/20",
    Icon: Zap,
  },
  filter_error: {
    card: "border-border/80 bg-muted/40",
    badge: "bg-muted text-muted-foreground",
    quote: "border-border/70",
    Icon: AlertTriangle,
  },
};

export function BlockedAttemptCard({
  attempt,
  childName,
}: {
  attempt: BlockedAttempt;
  childName: string;
}) {
  const view = describeBlockedAttempt(attempt);
  const chrome = CATEGORY_CHROME[view.category];
  const Icon = chrome.Icon;

  return (
    <article
      className={`rounded-2xl border p-4 space-y-2 shadow-2xs ${chrome.card}`}
      aria-label={`${view.categoryLabel} for ${childName}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-foreground text-sm truncate">{childName}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chrome.badge}`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {view.categoryLabel}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(attempt.created_at).toLocaleString()}
        </span>
      </div>
      <div className={`rounded-xl bg-background/80 p-3 border text-sm ${chrome.quote}`}>
        <p className="font-mono text-xs text-foreground/90">&ldquo;{attempt.content}&rdquo;</p>
      </div>
      <p className="text-xs font-medium text-foreground">{view.summary}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium hover:text-foreground">
          Technical details
        </summary>
        <p className="mt-1.5 font-mono break-all rounded-lg bg-background/70 px-2 py-1.5 border border-border/60">
          stage: {view.stage}
          {view.rawReason ? ` · ${view.rawReason}` : ""}
        </p>
      </details>
    </article>
  );
}
