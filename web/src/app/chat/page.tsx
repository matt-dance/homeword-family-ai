"use client";

import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, streamChat, type Child, type ConversationStarter } from "@/lib/api";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import { useReadAloud } from "@/hooks/use-read-aloud";
import { VoiceListener } from "@/components/voice-listener";
import { SpeakingIndicator } from "@/components/speaking-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { HomewardLogo } from "@/components/homeward-logo";
import {
  Send,
  Sparkles,
  Home,
  Mic,
  MicOff,
  Volume2,
  Play,
  Square,
  PlusCircle,
  LayoutList,
  Moon,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
}

function simpleModeKey(childId: number) {
  return `homeward-simple-mode-${childId}`;
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
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [starters, setStarters] = useState<ConversationStarter[]>([]);
  const [simpleMode, setSimpleMode] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [resumeOffered, setResumeOffered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text: string, fromVoice?: boolean) => Promise<void>>(async () => {});
  const autoReadNextRef = useRef(false);

  const { supported: readAloudSupported, error: readAloudError, state: readAloudState, speakMessage, stop: stopReadAloud, isSpeakingMessage } =
    useReadAloud();

  const handleVoiceTranscript = useCallback((text: string) => {
    autoReadNextRef.current = true;
    setInput(text);
    void sendRef.current(text, true);
  }, []);

  const {
    listening,
    transcribing,
    voiceSupported,
    speechError,
    audioLevel,
    interimTranscript,
    heardSpeech,
    toggleListening,
  } = useVoiceChat({
    onTranscript: handleVoiceTranscript,
    onListeningStart: stopReadAloud,
  });

  const handleMicClick = () => {
    stopReadAloud();
    toggleListening();
  };

  useEffect(() => {
    api.childrenPublic()
      .then((kids) => {
        setChildren(kids);
        const childParam = searchParams.get("child");
        if (childParam) {
          const match = kids.find((k) => k.id === parseInt(childParam));
          if (match) {
            setSelectedChild(match);
            setPinVerified(!match.has_pin);
          }
        } else if (kids.length === 1) {
          setSelectedChild(kids[0]);
          setPinVerified(!kids[0].has_pin);
        }
      })
      .catch(() => router.replace("/setup"))
      .finally(() => setLoading(false));
  }, [router, searchParams]);

  useEffect(() => {
    if (!selectedChild || !pinVerified) return;
    setSimpleMode(localStorage.getItem(simpleModeKey(selectedChild.id)) === "1");
    api.conversationStarters(selectedChild.id).then(setStarters).catch(() => setStarters([]));
  }, [selectedChild, pinVerified]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, simpleMode]);

  const initSession = useCallback(
    async (resume: boolean) => {
      if (!selectedChild) return;
      setSessionReady(false);
      setPinError("");

      if (resume && selectedChild.allow_resume !== false) {
        try {
          const resumed = await api.resumeSession(selectedChild.id);
          setChatSessionId(resumed.session_id);
          setMessages(
            resumed.messages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              blocked: m.blocked,
            })),
          );
          setResumeOffered(false);
          setSessionReady(true);
          return;
        } catch {
          // fall through to new session
        }
      }

      try {
        const session = await api.createChatSession(selectedChild.id);
        setChatSessionId(session.session_id);
        setMessages([]);
        setSessionReady(true);
      } catch {
        setPinError("Could not start chat session. Try switching profiles.");
      }
    },
    [selectedChild],
  );

  useEffect(() => {
    if (!selectedChild || !pinVerified || chatSessionId !== null) return;
    if (selectedChild.allow_resume !== false) {
      setResumeOffered(true);
    } else {
      void initSession(false);
    }
  }, [selectedChild, pinVerified, chatSessionId, initSession]);

  const handleNewChat = async () => {
    if (!selectedChild || streaming) return;
    stopReadAloud();
    const previousSessionId = chatSessionId;
    setChatSessionId(null);
    setMessages([]);
    setSessionReady(false);
    setResumeOffered(false);
    try {
      const session = await api.createChatSession(selectedChild.id, previousSessionId ?? undefined);
      setChatSessionId(session.session_id);
      setSessionReady(true);
    } catch {
      setPinError("Could not start a new chat. Try again.");
    }
  };

  const handleSelectChild = (child: Child) => {
    stopReadAloud();
    setSelectedChild(child);
    setPin("");
    setPinError("");
    setPinVerified(!child.has_pin);
    setChatSessionId(null);
    setMessages([]);
    setSessionReady(false);
    setResumeOffered(false);
    setStarters([]);
  };

  const handlePinSubmit = async () => {
    if (!selectedChild) return;
    try {
      await api.verifyPin(selectedChild.id, pin);
      setPinError("");
      setPinVerified(true);
      setChatSessionId(null);
      setMessages([]);
      setSessionReady(false);
      setResumeOffered(false);
    } catch {
      setPinError("That PIN doesn't match. Try again!");
    }
  };

  const toggleSimpleMode = () => {
    if (!selectedChild) return;
    const next = !simpleMode;
    setSimpleMode(next);
    localStorage.setItem(simpleModeKey(selectedChild.id), next ? "1" : "0");
  };

  const handleSend = useCallback(
    async (overrideText?: string, fromVoice = false) => {
      const userMsg = (overrideText ?? input).trim();
      if (!userMsg || !selectedChild || streaming) return;

      if (fromVoice) autoReadNextRef.current = true;

      if (selectedChild.chat_available === false) {
        setPinError(selectedChild.chat_unavailable_message || "Chat is not available right now.");
        return;
      }
      if (selectedChild.has_pin && !pinVerified) {
        setPinError("Please enter your PIN first");
        return;
      }
      if (!chatSessionId || !sessionReady) {
        setPinError("Chat session is not ready yet. Please wait a moment.");
        return;
      }

      setInput("");
      setPinError("");
      stopReadAloud();
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
            assistantContent = blockedMsg;
            setMessages((prev) => [
              ...prev.filter((m) => !(m.role === "assistant" && m.content === assistantContent && m.blocked)),
              { role: "assistant", content: blockedMsg, blocked: true },
            ]);
          },
          () => {
            setStreaming(false);
            if (!assistantContent || assistantContent.includes("Something went wrong")) return;
            if (!autoReadNextRef.current) return;
            autoReadNextRef.current = false;
            window.setTimeout(() => {
              setMessages((prev) => {
                let idx = -1;
                for (let i = prev.length - 1; i >= 0; i--) {
                  if (prev[i].role === "assistant") {
                    idx = i;
                    break;
                  }
                }
                if (idx >= 0) speakMessage(`msg-${idx}`, prev[idx].content);
                return prev;
              });
            }, 0);
          },
          chatSessionId,
        );
      } catch (e) {
        const fallback =
          e instanceof Error ? e.message : "Something went wrong. Please try again in a moment!";
        setMessages((prev) => [...prev, { role: "assistant", content: fallback, blocked: true }]);
        setStreaming(false);
      }
    },
    [input, selectedChild, streaming, pinVerified, chatSessionId, sessionReady, messages, speakMessage, stopReadAloud],
  );

  useEffect(() => {
    sendRef.current = handleSend;
  }, [handleSend]);

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
                <Button onClick={handlePinSubmit} className="w-full h-12 text-lg">
                  Let&apos;s go!
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedChild(null);
                    setPinVerified(false);
                  }}
                  className="w-full"
                >
                  Pick someone else
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  if (resumeOffered && chatSessionId === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/30 to-background flex flex-col items-center justify-center p-6">
        <Sparkles className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-xl font-bold mb-2">Welcome back, {selectedChild.name}!</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-sm">
          Do you want to continue your last chat or start fresh?
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button className="h-12 text-lg" onClick={() => initSession(true)}>
            Continue last chat
          </Button>
          <Button variant="outline" className="h-12 text-lg" onClick={() => initSession(false)}>
            Start new chat
          </Button>
        </div>
      </div>
    );
  }

  if (selectedChild.chat_available === false) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50/40 to-background flex flex-col items-center justify-center p-6 text-center">
        <Moon className="h-12 w-12 text-primary mb-4" />
        <h2 className="text-xl font-bold mb-2">Homeward is resting</h2>
        <p className="text-muted-foreground max-w-sm mb-6">
          {selectedChild.chat_unavailable_message ||
            "Chat isn't open right now. Ask a parent when you can come back."}
        </p>
        <Button variant="outline" onClick={() => handleSelectChild(selectedChild)}>
          Switch profile
        </Button>
      </div>
    );
  }

  const displayedMessages = (
    simpleMode && messages.length > 0
      ? messages.map((m, i) => ({ message: m, index: i })).slice(-2)
      : messages.map((m, i) => ({ message: m, index: i }))
  );

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-50/30 to-background dark:from-slate-900/30">
      <header className="border-b border-border bg-card/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{selectedChild.name}&apos;s Chat</p>
              <p className="text-xs text-muted-foreground">
                {selectedChild.homework_mode ? "Homework mode · " : ""}
                Homeward is keeping you safe
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <Button variant="ghost" size="sm" onClick={handleNewChat} disabled={streaming} title="New chat">
              <PlusCircle className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline text-xs">New</span>
            </Button>
            <Button
              variant={simpleMode ? "outline" : "ghost"}
              size="sm"
              onClick={toggleSimpleMode}
              title="Simple mode — bigger, fewer messages"
            >
              <LayoutList className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline text-xs">{simpleMode ? "Simple" : "Full"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                stopReadAloud();
                setSelectedChild(null);
                setMessages([]);
                setPin("");
                setPinVerified(false);
                setChatSessionId(null);
                setSessionReady(false);
                setResumeOffered(false);
              }}
            >
              Switch
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className={`mx-auto space-y-4 ${simpleMode ? "max-w-xl" : "max-w-2xl"}`}>
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="mx-auto h-10 w-10 text-primary/60 mb-4" />
              <p className={`font-medium ${simpleMode ? "text-2xl" : "text-lg"}`}>
                Hi {selectedChild.name}! 👋
              </p>
              <p className="text-muted-foreground mt-2">Tap a idea below, type, or use the mic!</p>
              {starters.length > 0 && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {starters.map((starter) => (
                    <Button
                      key={starter.label}
                      variant="outline"
                      className={`h-auto py-4 px-4 whitespace-normal text-left justify-start ${
                        simpleMode ? "text-base min-h-[3.5rem]" : "text-sm"
                      }`}
                      disabled={streaming || !sessionReady}
                      onClick={() => handleSend(starter.message)}
                    >
                      {starter.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {displayedMessages.map(({ message: msg, index: i }) => {
            const messageKey = `msg-${i}`;
            const isAssistant = msg.role === "assistant";
            const isReading = isSpeakingMessage(messageKey);

            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] ${isAssistant ? "space-y-2" : ""}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 transition-shadow ${
                      simpleMode ? "text-base sm:text-lg px-5 py-4" : "text-sm"
                    } ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : msg.blocked
                          ? "bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
                          : "bg-card border border-border"
                    } ${isReading && readAloudState.isSpeaking ? "ring-2 ring-primary/40 shadow-sm" : ""}`}
                  >
                    {msg.content}
                  </div>
                  {isReading && readAloudState.isSpeaking && (
                    <SpeakingIndicator simpleMode={simpleMode} />
                  )}
                  {isAssistant && readAloudSupported && !streaming && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2"
                      onClick={() => speakMessage(messageKey, msg.content)}
                      disabled={readAloudState.isLoading && readAloudState.messageKey === messageKey}
                    >
                      {isReading ? (
                        readAloudState.isLoading ? (
                          <>
                            <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                            Loading…
                          </>
                        ) : (
                          <>
                            <Square className="h-3.5 w-3.5" />
                            Stop reading
                          </>
                        )
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Listen
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {streaming && (
            <div className="flex justify-start">
              <div className={`rounded-2xl bg-card border border-border px-5 py-4 ${simpleMode ? "text-lg" : "text-sm"}`}>
                <span className="animate-pulse text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-card/90 backdrop-blur p-4">
        <div className={`mx-auto space-y-2 ${simpleMode ? "max-w-xl" : "max-w-2xl"}`}>
          {(speechError || pinError || readAloudError) && (
            <p className="text-xs text-destructive text-center">{speechError || pinError || readAloudError}</p>
          )}
          {listening && !speechError && (
            <VoiceListener
              audioLevel={audioLevel}
              interimTranscript={interimTranscript}
              heardSpeech={heardSpeech}
              simpleMode={simpleMode}
            />
          )}
          {transcribing && (
            <p className="text-sm text-muted-foreground text-center">Understanding what you said…</p>
          )}
          <div className="flex gap-2">
            {voiceSupported && (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={handleMicClick}
                disabled={streaming || transcribing || !sessionReady}
                className={`shrink-0 ${simpleMode ? "h-12 w-12" : "h-10 w-10"}`}
              >
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
            )}
            <Input
              placeholder={voiceSupported ? "Type or tap the mic…" : "Ask me anything…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={streaming || listening || transcribing || !sessionReady}
              className={`flex-1 ${simpleMode ? "h-12 text-base" : ""}`}
            />
            <Button
              onClick={() => handleSend()}
              disabled={streaming || !input.trim() || !sessionReady || transcribing}
              size="icon"
              className={simpleMode ? "h-12 w-12" : ""}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
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
