"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { api, streamChat, type Child, type ConversationStarter } from "@/lib/api";
import { useVoiceChat } from "@/hooks/use-voice-chat";
import { useReadAloud } from "@/hooks/use-read-aloud";
import { VoiceListener } from "@/components/voice-listener";
import { SpeakingIndicator } from "@/components/speaking-indicator";
import { HomeworkCamera } from "@/components/homework-camera";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ChatToolCards } from "@/components/chat-tools";
import { ReplyChips } from "@/components/reply-chips";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  constrainChatTools,
  extractChatTools,
  mergeChatTools,
  type CardRoute,
  type ChatTool,
  type StoryTool,
} from "@/lib/chat-tools";
import { shouldShowReplyChips } from "@/lib/reply-chips";
import { shouldOfferResume } from "@/lib/resume-session";
import { getAgeTheme, AGE_THEME_CONFIGS } from "@/lib/age-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  Play,
  Square,
  PlusCircle,
  LayoutList,
  Moon,
  ShieldCheck,
  BookOpen,
  Globe,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  RotateCcw,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
  tools?: ChatTool[];
  cardRoute?: CardRoute | null;
}

function simpleModeKey(childId: number) {
  return `homeward-simple-mode-${childId}`;
}

function spokenTextForMessage(msg: Message) {
  const parsed = extractChatTools(msg.content, msg.tools, msg.cardRoute);
  const story = parsed.tools.find((tool): tool is StoryTool => tool.type === "story");
  return story?.pages?.[0]?.text || parsed.text;
}

const CHAT_ERROR_MESSAGE = "Oops — something got tangled up. Please try again in a moment!";
const SESSION_ERROR_MESSAGE = "We couldn't start a chat right now. Try again, or pick a different profile.";

interface KidChatViewProps {
  selectedChild: Child;
  onSwitchProfile: () => void;
  displayName?: string;
  quickChat?: boolean;
}

export function KidChatView({ selectedChild, onSwitchProfile, displayName, quickChat = false }: KidChatViewProps) {
  const ageThemeKey = getAgeTheme(selectedChild);
  const ageConfig = AGE_THEME_CONFIGS[ageThemeKey];

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerified, setPinVerified] = useState(!selectedChild.has_pin);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [starters, setStarters] = useState<ConversationStarter[]>([]);
  const [simpleMode, setSimpleMode] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [resumeOffered, setResumeOffered] = useState(false);
  const [resumeChecking, setResumeChecking] = useState(false);
  const [storyPageText, setStoryPageText] = useState<Record<number, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text: string, fromVoice?: boolean) => Promise<void>>(async () => {});
  const autoReadNextRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const cardRouteRef = useRef<CardRoute | null>(null);

  // Voice conversation loop: swap these two hooks for useVoiceConversation({
  //   onTranscript: handleVoiceTranscript,
  // }). After the assistant stream finishes, call notifyAssistantDone(spoken)
  // when conversationActive (instead of speakMessage). Mic tap while TTS is
  // playing should call bargeIn(). See hooks/use-voice-conversation.ts.
  const {
    supported: readAloudSupported,
    error: readAloudError,
    state: readAloudState,
    speakMessage,
    stop: stopReadAloud,
    isSpeakingMessage,
  } = useReadAloud(selectedChild.voice_gender);

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
    setPinVerified(!selectedChild.has_pin);
    setPin("");
    setPinError("");
    setChatSessionId(null);
    setMessages([]);
    setSessionReady(false);
    setResumeOffered(false);
    setResumeChecking(false);
    setStoryPageText({});
    setStarters([]);
  }, [selectedChild.id, selectedChild.has_pin]);

  useEffect(() => {
    if (!pinVerified) return;
    setSimpleMode(localStorage.getItem(simpleModeKey(selectedChild.id)) === "1");
    api.conversationStarters(selectedChild.id).then(setStarters).catch(() => setStarters([]));
  }, [selectedChild.id, pinVerified]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, simpleMode, streaming]);

  const initSession = useCallback(
    async (resume: boolean) => {
      setSessionReady(false);
      setPinError("");

      if (resume && selectedChild.allow_resume !== false) {
        try {
          const resumed = await api.resumeSession(selectedChild.id);
          const history = (resumed.messages ?? []).filter(
            (m) => m.content && (m.role === "user" || m.role === "assistant"),
          );
          if (history.length > 0) {
            setChatSessionId(resumed.session_id);
            setMessages(
              history.map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
                blocked: m.blocked,
              })),
            );
            setResumeOffered(false);
            setSessionReady(true);
            return;
          }
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
        setPinError(SESSION_ERROR_MESSAGE);
      }
    },
    [selectedChild],
  );

  useEffect(() => {
    if (!pinVerified || chatSessionId !== null) return;
    let cancelled = false;

    // Quick Chat is anonymous and shared, so never offer another kid's last chat.
    if (selectedChild.allow_resume === false || quickChat) {
      setResumeOffered(false);
      setResumeChecking(false);
      void initSession(false);
      return;
    }

    setResumeChecking(true);
    setResumeOffered(false);

    void api
      .resumeSession(selectedChild.id)
      .then((resumed) => {
        if (cancelled) return;
        if (shouldOfferResume({ allowResume: selectedChild.allow_resume, quickChat, session: resumed })) {
          setResumeOffered(true);
          setResumeChecking(false);
          return;
        }
        setResumeChecking(false);
        void initSession(false);
      })
      .catch(() => {
        if (cancelled) return;
        setResumeChecking(false);
        void initSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChild, pinVerified, chatSessionId, initSession, quickChat]);

  const handleNewChat = async () => {
    if (streaming) return;
    stopReadAloud();
    const previousSessionId = chatSessionId;
    setChatSessionId(null);
    setMessages([]);
    setSessionReady(false);
    setResumeOffered(false);
    setResumeChecking(false);
    setStoryPageText({});
    try {
      const session = await api.createChatSession(selectedChild.id, previousSessionId ?? undefined);
      setChatSessionId(session.session_id);
      setSessionReady(true);
    } catch {
      setPinError(SESSION_ERROR_MESSAGE);
    }
  };

  const handlePinSubmit = async () => {
    if (!pin.trim()) return;
    try {
      await api.verifyPin(selectedChild.id, pin);
      setPinError("");
      setPinVerified(true);
      setChatSessionId(null);
      setMessages([]);
      setSessionReady(false);
      setResumeOffered(false);
      setResumeChecking(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      // The server explains lockouts ("Too many attempts…"); everything else is a mismatch.
      setPinError(
        message.toLowerCase().includes("too many") ? message : "That PIN doesn't match. Try again!",
      );
    }
  };

  const toggleSimpleMode = () => {
    const next = !simpleMode;
    setSimpleMode(next);
    localStorage.setItem(simpleModeKey(selectedChild.id), next ? "1" : "0");
  };

  const handleSend = useCallback(
    async (overrideText?: string, fromVoice = false) => {
      const userMsg = (overrideText ?? input).trim();
      if (!userMsg || streaming) return;

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
      cardRouteRef.current = null;
      setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
      setStreaming(true);
      setStreamStatus("Checking your message…");

      let assistantContent = "";
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(
          userMsg,
          selectedChild.id,
          (token) => {
            assistantContent += token;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && !last.blocked) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, role: "assistant", content: assistantContent, cardRoute: last.cardRoute ?? cardRouteRef.current },
                ];
              }
              return [
                ...prev,
                { role: "assistant", content: assistantContent, cardRoute: cardRouteRef.current },
              ];
            });
          },
          (blockedMsg, blockedTools) => {
            assistantContent = blockedMsg;
            // Drop any half-streamed reply so the kid sees one clear message, not both.
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const base = last?.role === "assistant" ? prev.slice(0, -1) : prev;
              return [
                ...base,
                {
                  role: "assistant",
                  content: blockedMsg,
                  blocked: true,
                  tools: mergeChatTools([], blockedTools),
                },
              ];
            });
          },
          () => {
            setStreaming(false);
            setStreamStatus(null);
            if (controller.signal.aborted) return;
            if (!assistantContent || assistantContent === CHAT_ERROR_MESSAGE) return;
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
                if (idx >= 0) {
                  const spoken = spokenTextForMessage(prev[idx]);
                  if (spoken) speakMessage(`msg-${idx}`, spoken);
                }
                return prev;
              });
            }, 0);
          },
          chatSessionId,
          (tools) => {
            const routed = constrainChatTools(mergeChatTools([], tools), cardRouteRef.current);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && !last.blocked) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    tools: mergeChatTools(last.tools, routed),
                    cardRoute: last.cardRoute ?? cardRouteRef.current,
                  },
                ];
              }
              return [
                ...prev,
                { role: "assistant", content: "", tools: routed, cardRoute: cardRouteRef.current },
              ];
            });
          },
          controller.signal,
          quickChat,
          (status) => setStreamStatus(status),
          (route) => {
            cardRouteRef.current = route;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role !== "assistant" || last.blocked) return prev;
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  cardRoute: route,
                  tools: last.tools ? constrainChatTools(last.tools, route) : last.tools,
                },
              ];
            });
          },
        );
      } catch (e) {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
          setStreaming(false);
          setStreamStatus(null);
          return;
        }
        console.error("Chat stream failed", e);
        const text =
          e instanceof Error && e.message ? e.message : CHAT_ERROR_MESSAGE;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const base = last?.role === "assistant" && !last.content ? prev.slice(0, -1) : prev;
          return [...base, { role: "assistant", content: text, blocked: true }];
        });
        setStreaming(false);
        setStreamStatus(null);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [input, selectedChild, streaming, pinVerified, chatSessionId, sessionReady, speakMessage, stopReadAloud, quickChat],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStreamStatus(null);
    stopReadAloud();
  }, [stopReadAloud]);

  useEffect(() => {
    sendRef.current = handleSend;
  }, [handleSend]);

  const handleSwitch = () => {
    stopReadAloud();
    onSwitchProfile();
  };

  // PIN screen
  if (selectedChild.has_pin && !pinVerified) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${ageConfig.ambientGradient}`}>
        <main className="w-full max-w-md animate-pop-in">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 text-3xl shadow-lg shadow-primary/25">
              {ageConfig.avatarEmoji}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {displayName ?? `Hi, ${selectedChild.name}!`}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {displayName
                ? "This shared chat is PIN protected. Ask a parent for the household PIN."
                : "Enter your secret PIN to unlock your chat"}
            </p>
          </div>
          <Card className="border-border/80 bg-card/95 shadow-xl backdrop-blur-md rounded-2xl">
            <CardContent className="pt-6 space-y-4">
              <Input
                type="password"
                placeholder="• • • •"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                maxLength={6}
                className="text-center text-2xl tracking-[0.4em] font-mono h-14 rounded-xl border-border/80 focus-visible:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
                autoFocus
              />
              {pinError && (
                <p className="text-sm font-medium text-destructive text-center animate-slide-down">
                  {pinError}
                </p>
              )}
              <Button
                onClick={handlePinSubmit}
                className="w-full h-12 text-base font-semibold rounded-xl shadow-sm shadow-primary/20"
              >
                Let&apos;s go!
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                onClick={handleSwitch}
                className="w-full text-muted-foreground hover:text-foreground"
              >
                Pick a different profile
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (resumeChecking && chatSessionId === null && !resumeOffered) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${ageConfig.ambientGradient}`}>
        <div className="w-full max-w-sm text-center space-y-4 animate-pop-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl shadow-inner">
            {ageConfig.avatarEmoji}
          </div>
          <p className="text-sm font-medium text-muted-foreground">Getting your chat ready…</p>
        </div>
      </div>
    );
  }

  // Resume prompt screen
  if (resumeOffered && chatSessionId === null) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${ageConfig.ambientGradient}`}>
        <div className="w-full max-w-sm text-center space-y-6 animate-pop-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl shadow-inner">
            {ageConfig.avatarEmoji}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {displayName ? `Welcome to ${displayName}!` : `Welcome back, ${selectedChild.name}!`}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Would you like to pick up where you left off, or start a brand new conversation?
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              className="h-12 text-base font-semibold rounded-xl shadow-sm shadow-primary/25"
              onClick={() => initSession(true)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Continue last chat
            </Button>
            <Button
              variant="outline"
              className="h-12 text-base font-semibold rounded-xl border-border/80 bg-card/80"
              onClick={() => initSession(false)}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Start fresh chat
            </Button>
            {pinError && (
              <p className="text-sm font-medium text-destructive animate-slide-down">{pinError}</p>
            )}
            <Button variant="ghost" onClick={handleSwitch} className="text-muted-foreground hover:text-foreground">
              Pick a different profile
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Quiet hours screen
  if (selectedChild.chat_available === false) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${ageConfig.ambientGradient}`}>
        <div className="w-full max-w-md space-y-5 animate-pop-in">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 shadow-sm">
            <Moon className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Homeward is resting
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {selectedChild.chat_unavailable_message ||
                "Chat isn't open right now. Ask a parent when quiet hours are over!"}
            </p>
          </div>
          <Button variant="outline" onClick={handleSwitch} className="rounded-xl px-6">
            <UserCheck className="mr-2 h-4 w-4" />
            Switch profile
          </Button>
        </div>
      </div>
    );
  }

  const displayedMessages = (
    simpleMode && messages.length > 0
      ? messages.map((m, i) => ({ message: m, index: i })).slice(-2)
      : messages.map((m, i) => ({ message: m, index: i }))
  );
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div className={`flex min-h-screen flex-col transition-colors duration-300 ${ageConfig.ambientGradient}`}>
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-card/85 backdrop-blur-md px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${ageConfig.avatarBg}`}
            >
              {ageConfig.avatarEmoji}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-base sm:text-lg tracking-tight truncate text-foreground">
                  {displayName ?? `${selectedChild.name}'s Chat`}
                </p>
                <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/20">
                  {ageConfig.title} · {ageConfig.ageRange}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {selectedChild.homework_mode && (
                  <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Homework mode ·
                  </span>
                )}
                {selectedChild.live_lookups && (
                  <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Live lookups ·
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Safe & protected
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle size="sm" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={streaming}
              title="Start a new chat"
              aria-label="Start a new chat"
              className="rounded-lg text-muted-foreground hover:text-foreground"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline text-xs font-medium">New</span>
            </Button>
            <Button
              variant={simpleMode ? "default" : "ghost"}
              size="sm"
              onClick={toggleSimpleMode}
              title="Simple mode — bigger, fewer messages"
              aria-label={simpleMode ? "Switch to full view" : "Switch to simple mode"}
              aria-pressed={simpleMode}
              className="rounded-lg text-xs font-medium"
            >
              <LayoutList className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">{simpleMode ? "Simple" : "Full"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSwitch}
              className="rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Switch
            </Button>
          </div>
        </div>
      </header>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className={`mx-auto space-y-4 ${simpleMode ? "max-w-xl space-y-6" : "max-w-2xl"}`}>
          {/* Empty State / Conversation Starters */}
          {messages.length === 0 && (
            <div className="text-center py-6 sm:py-10 space-y-6 animate-fade-in">
              <div className="space-y-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 text-2xl shadow-md shadow-primary/20 animate-bounce-gentle">
                  {ageConfig.avatarEmoji}
                </div>
                <h2
                  className={`font-extrabold tracking-tight text-foreground ${
                    simpleMode ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
                  }`}
                >
                  {displayName ? "Hi there! 👋" : `Hi ${selectedChild.name}! 👋`}
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
                  {ageConfig.heroSub}
                </p>
              </div>

              {starters.length > 0 && (
                <div className="grid gap-2.5 sm:grid-cols-2 text-left pt-2">
                  {starters.map((starter) => (
                    <button
                      key={starter.label}
                      disabled={streaming || !sessionReady}
                      onClick={() => handleSend(starter.message)}
                      className={`group relative flex items-center justify-between rounded-2xl border border-border/80 bg-card/90 p-4 text-left shadow-xs transition-all hover:border-primary/50 hover:bg-card hover:shadow-md active:scale-[0.99] disabled:opacity-50 ${
                        simpleMode ? "min-h-[4rem] text-base p-5" : "text-sm"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {starter.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {starter.message}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {displayedMessages.map(({ message: msg, index: i }) => {
            const messageKey = `msg-${i}`;
            const isAssistant = msg.role === "assistant";
            const isReading = isSpeakingMessage(messageKey);
            const parsed =
              isAssistant && !msg.blocked ? extractChatTools(msg.content, msg.tools, msg.cardRoute) : null;
            const displayText = parsed?.text ?? msg.content;
            const tools = parsed?.tools ?? msg.tools ?? [];
            const listenText = storyPageText[i] || displayText;
            const showChips = shouldShowReplyChips({
              streaming,
              blocked: msg.blocked,
              isLastAssistant: isAssistant && i === lastAssistantIndex,
            });

            return (
              <div
                key={i}
                className={`flex gap-2.5 animate-slide-up ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {/* Assistant avatar badge */}
                {isAssistant && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground text-xs font-bold shadow-xs mt-1">
                    <Sparkles className="h-4 w-4" />
                  </div>
                )}

                <div className={`max-w-[88%] sm:max-w-[82%] ${isAssistant ? "space-y-2.5" : ""}`}>
                  {displayText ? (
                    <div
                      className={`px-4 sm:px-5 py-3 sm:py-3.5 transition-all shadow-xs ${
                        ageConfig.bubbleRadius
                      } ${simpleMode ? ageConfig.fontSizeSimple : ageConfig.fontSize} ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground font-medium shadow-primary/20 shadow-sm"
                          : msg.blocked
                            ? "border border-amber-500/40 bg-amber-50/90 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
                            : "border border-border/70 bg-card/95 text-foreground backdrop-blur-sm"
                      } ${
                        isReading && readAloudState.isSpeaking
                          ? "ring-2 ring-primary/60 shadow-md shadow-primary/15"
                          : ""
                      }`}
                    >
                      {msg.blocked ? (
                        <div className="flex items-start gap-2.5">
                          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span className="whitespace-pre-wrap leading-relaxed">
                            {displayText}
                          </span>
                        </div>
                      ) : isAssistant ? (
                        <ChatMarkdown text={displayText} simpleMode={simpleMode} />
                      ) : (
                        <span className="whitespace-pre-wrap leading-relaxed">{displayText}</span>
                      )}
                    </div>
                  ) : null}

                  {/* Tool Cards */}
                  {isAssistant && tools.length > 0 && (
                    <ChatToolCards
                      tools={tools}
                      onSend={(text) => {
                        void handleSend(text);
                      }}
                      onSpeak={(text) => speakMessage(`${messageKey}-story`, text)}
                      speakSupported={readAloudSupported}
                      isSpeaking={isSpeakingMessage(`${messageKey}-story`)}
                      speakLoading={readAloudState.isLoading && readAloudState.messageKey === `${messageKey}-story`}
                      onStoryPageText={(text) => {
                        setStoryPageText((prev) => (prev[i] === text ? prev : { ...prev, [i]: text }));
                      }}
                    />
                  )}

                  {/* Speaking indicator / audio player */}
                  {isReading && readAloudState.isSpeaking && (
                    <SpeakingIndicator simpleMode={simpleMode} />
                  )}

                  {/* Listen button */}
                  {isAssistant && readAloudSupported && !streaming && listenText && !msg.blocked && (
                    <div className="pt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full px-3 gap-1.5 text-xs font-medium border-border/70 bg-card/80 hover:bg-card hover:border-primary/50 text-muted-foreground hover:text-foreground shadow-2xs"
                        onClick={() => speakMessage(messageKey, listenText)}
                        disabled={readAloudState.isLoading && readAloudState.messageKey === messageKey}
                      >
                        {isReading ? (
                          readAloudState.isLoading ? (
                            <>
                              <Volume2 className="h-3.5 w-3.5 animate-pulse text-primary" />
                              <span>Loading speech…</span>
                            </>
                          ) : (
                            <>
                              <Square className="h-3.5 w-3.5 text-destructive fill-destructive" />
                              <span>Stop reading</span>
                            </>
                          )
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 fill-primary text-primary" />
                            <span>Listen</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {showChips && (
                    <ReplyChips
                      disabled={streaming || !sessionReady}
                      onSend={(text) => {
                        void handleSend(text);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking shimmer indicator */}
          {streaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-2.5 justify-start animate-slide-up">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground text-xs font-bold shadow-xs mt-1 animate-pulse">
                <Sparkles className="h-4 w-4" />
              </div>
              <div
                className={`rounded-2xl border border-border/70 bg-card/90 px-4 py-3 shadow-xs flex items-center gap-2 ${
                  simpleMode ? "text-base" : "text-sm"
                }`}
              >
                <span className="flex gap-1 items-center">
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                </span>
                <span className="text-xs text-muted-foreground font-medium pl-1">
                  {streamStatus || "Thinking…"}
                </span>
                <button
                  type="button"
                  onClick={handleStop}
                  className="ml-2 rounded-lg px-2 py-0.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Dock */}
      <div className="sticky bottom-0 z-20 border-t border-border/60 bg-card/90 backdrop-blur-md p-3 sm:p-4 shadow-lg transition-colors">
        <div className={`mx-auto space-y-2.5 ${simpleMode ? "max-w-xl" : "max-w-2xl"}`}>
          {(speechError || pinError || readAloudError) && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-center text-xs font-medium text-destructive animate-slide-down">
              {speechError || pinError || readAloudError}
            </div>
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
            <p className="text-xs text-center font-medium text-primary animate-pulse">
              Understanding what you said…
            </p>
          )}

          <div className="relative flex items-center gap-2">
            {voiceSupported && (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={handleMicClick}
                disabled={streaming || transcribing || !sessionReady}
                title={listening ? "Stop voice listening" : "Speak with microphone"}
                aria-label={listening ? "Stop voice listening" : "Speak with microphone"}
                className={`shrink-0 rounded-2xl transition-all ${
                  listening ? "shadow-md shadow-destructive/25 scale-105" : "border-border/80 bg-card hover:bg-primary/5 hover:border-primary/50"
                } ${simpleMode ? "h-14 w-14" : "h-11 w-11"}`}
              >
                {listening ? (
                  <MicOff className="h-5 w-5 animate-pulse" />
                ) : (
                  <Mic className="h-5 w-5 text-primary" />
                )}
              </Button>
            )}
            <HomeworkCamera
              childId={selectedChild.id}
              enabled={Boolean(selectedChild.homework_mode)}
              disabled={streaming || listening || transcribing || !sessionReady}
              simpleMode={simpleMode}
            />
            <Input
              placeholder={
                displayName
                  ? "Ask me anything…"
                  : voiceSupported
                  ? `Ask me anything, ${selectedChild.name}…`
                  : `Ask a question, ${selectedChild.name}…`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={streaming || listening || transcribing || !sessionReady}
              className={`flex-1 rounded-2xl border-border/80 bg-background/90 px-4 focus-visible:ring-primary shadow-2xs ${
                simpleMode ? "h-14 text-base" : "h-11 text-sm"
              }`}
            />
            {streaming ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleStop}
                title="Stop the reply"
                aria-label="Stop the reply"
                className={`shrink-0 rounded-2xl shadow-sm transition-transform active:scale-95 ${
                  simpleMode ? "h-14 px-5 text-base" : "h-11 px-4 text-sm"
                }`}
              >
                <Square className="h-4 w-4 fill-current" />
                <span>Stop</span>
              </Button>
            ) : (
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || !sessionReady || transcribing}
                size="icon"
                title="Send message"
                aria-label="Send message"
                className={`shrink-0 rounded-2xl shadow-sm shadow-primary/20 transition-transform active:scale-95 ${
                  simpleMode ? "h-14 w-14" : "h-11 w-11"
                }`}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
