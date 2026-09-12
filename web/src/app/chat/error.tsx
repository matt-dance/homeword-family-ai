"use client";

import { KidSafeRouteError } from "@/components/kid-safe-route-error";

export default function ChatPickerRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <KidSafeRouteError error={error} reset={reset} reportContext="chat-picker-route-error" />;
}
