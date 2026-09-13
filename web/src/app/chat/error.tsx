"use client";

import { KidChatRouteError } from "@/components/kid-chat-route-error";

export default function ChatPickerRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <KidChatRouteError error={error} reset={reset} context="kid-chat-picker-route-error" />;
}
