"use client";

interface ConversationIndicatorProps {
  phase: "idle" | "listening" | "transcribing" | "waiting" | "speaking" | "ready";
  simpleMode?: boolean;
}

const PHASE_LABEL: Record<ConversationIndicatorProps["phase"], string> = {
  idle: "Conversation off",
  ready: "Conversation on — tap the mic or just talk",
  listening: "Conversation on — listening",
  transcribing: "Conversation on — understanding you…",
  waiting: "Conversation on — thinking…",
  speaking: "Conversation on — tap or talk to interrupt",
};

export function ConversationIndicator({ phase, simpleMode }: ConversationIndicatorProps) {
  if (phase === "idle") return null;

  return (
    <p
      className={`text-center font-medium text-primary ${
        simpleMode ? "text-sm" : "text-xs"
      }`}
      aria-live="polite"
    >
      {PHASE_LABEL[phase]}
    </p>
  );
}
