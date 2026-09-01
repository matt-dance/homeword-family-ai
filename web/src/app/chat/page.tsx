"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, streamChat, type Child } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { HomewardLogo } from "@/components/homeward-logo";
import { Send, Sparkles, Home } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
}

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.childrenPublic()
      .then((kids) => {
        setChildren(kids);
        const childParam = searchParams.get("child");
        if (childParam) {
          const match = kids.find((k) => k.id === parseInt(childParam));
          if (match && !match.has_pin) setSelectedChild(match);
        } else if (kids.length === 1 && !kids[0].has_pin) {
          setSelectedChild(kids[0]);
        }
      })
      .catch(() => router.replace("/setup"))
      .finally(() => setLoading(false));
  }, [router, searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectChild = (child: Child) => {
    setSelectedChild(child);
    setPin("");
    setPinError("");
    setPinVerified(!child.has_pin);
    setMessages([]);
  };

  const handlePinSubmit = async () => {
    if (!selectedChild) return;
    try {
      await api.verifyPin(selectedChild.id, pin);
      setPinError("");
      setPinVerified(true);
      setMessages([]);
    } catch {
      setPinError("That PIN doesn't match. Try again!");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedChild || streaming) return;

  // Verify pin first if needed
    if (selectedChild.has_pin && !pinVerified) {
      setPinError("Please enter your PIN first");
      return;
    }

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    let assistantContent = "";

    try {
      await streamChat(
        userMsg,
        selectedChild.id,
        history,
        (token) => {
          assistantContent += token;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.blocked) {
              return [...prev.slice(0, -1), { role: "assistant", content: assistantContent }];
            }
            return [...prev, { role: "assistant", content: assistantContent }];
          });
        },
        (blockedMsg) => {
          setMessages((prev) => [
            ...prev.filter((m) => m.role !== "assistant" || m.content !== assistantContent),
            { role: "assistant", content: blockedMsg, blocked: true },
          ]);
        },
        () => setStreaming(false),
      );
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again in a moment!",
          blocked: true,
        },
      ]);
      setStreaming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">No profiles yet. Ask a parent to set up Homeward.</p>
        <Link href="/">
          <Button variant="outline">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>
        </Link>
      </div>
    );
  }

  // Profile picker or PIN gate
  if (!selectedChild || (selectedChild.has_pin && !pinVerified)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 to-background dark:from-slate-900/50">
        <header className="border-b border-border bg-card/80 p-4">
          <HomewardLogo />
        </header>
        <main className="mx-auto max-w-md p-8">
          <div className="text-center mb-8">
            <Sparkles className="mx-auto h-12 w-12 text-primary mb-4" />
            <h1 className="text-2xl font-bold">Who&apos;s chatting today?</h1>
            <p className="text-muted-foreground mt-2">Pick your profile to start</p>
          </div>

          <div className="space-y-3">
            {children.map((child) => (
              <Button
                key={child.id}
                variant="outline"
                className="w-full h-14 text-lg justify-start px-6"
                onClick={() => handleSelectChild(child)}
              >
                {child.name}
              </Button>
            ))}
          </div>

          {selectedChild?.has_pin && !pinVerified && (
            <Card className="mt-6">
              <CardContent className="pt-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your PIN to open {selectedChild.name}&apos;s chat
                </p>
                <Input
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={6}
                  className="text-center text-lg"
                />
                {pinError && <p className="text-sm text-destructive">{pinError}</p>}
                <Button onClick={handlePinSubmit} className="w-full">Let&apos;s go!</Button>
                <Button variant="ghost" onClick={() => { setSelectedChild(null); setPinVerified(false); }} className="w-full">
                  Pick someone else
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50/30 to-background dark:from-slate-900/30">
      <header className="border-b border-border bg-card/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold">{selectedChild.name}&apos;s Chat</p>
              <p className="text-xs text-muted-foreground">Homeward is keeping you safe</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSelectedChild(null); setMessages([]); setPin(""); setPinVerified(false); }}>
            Switch profile
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="mx-auto h-10 w-10 text-primary/60 mb-4" />
              <p className="text-lg font-medium">Hi {selectedChild.name}! 👋</p>
              <p className="text-muted-foreground mt-2">
                Ask me anything — I love helping with homework, stories, and fun facts!
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : msg.blocked
                      ? "bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
                      : "bg-card border border-border"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {streaming && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-card border border-border px-4 py-3">
                <span className="animate-pulse text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-card/90 backdrop-blur p-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Input
            placeholder="Ask me anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={streaming}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={streaming || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <ChatContent />
    </Suspense>
  );
}
