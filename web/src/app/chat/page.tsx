import { Suspense } from "react";
import { ChatPickerContent, ChatPickerFallback } from "@/components/chat-picker";

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatPickerFallback />}>
      <ChatPickerContent />
    </Suspense>
  );
}
