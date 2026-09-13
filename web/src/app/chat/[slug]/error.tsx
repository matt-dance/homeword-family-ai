"use client";

import { KidChatRouteError } from "@/components/kid-chat-route-error";

export default function KidChatRouteErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <KidChatRouteError error={error} reset={reset} context="kid-chat-route-error" />;
}
