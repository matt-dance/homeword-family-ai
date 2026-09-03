"use client";

import { REPLY_CHIPS } from "@/lib/reply-chips";
import { HelpCircle, MessageCircleMore, Sparkles } from "lucide-react";

const CHIP_ICONS = {
  simpler: Sparkles,
  more: MessageCircleMore,
  quiz: HelpCircle,
} as const;

export function ReplyChips({
  onSend,
  disabled,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {REPLY_CHIPS.map((chip) => {
        const Icon = CHIP_ICONS[chip.id];
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onSend(chip.message)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
          >
            <Icon className="h-3.5 w-3.5" />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
