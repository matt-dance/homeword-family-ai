"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { api, streamChat, type Child, type ConversationStarter } from "@/lib/api";
import { useVoiceConversation } from "@/hooks/use-voice-conversation";
import { VoiceListener } from "@/components/voice-listener";
import { SpeakingIndicator } from "@/components/speaking-indicator";
import { ConversationIndicator } from "@/components/conversation-indicator";
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
import { shouldShowStreamThinking } from "@/lib/stream-progress";
import { StreamComposerHint, StreamWorkingBubble } from "@/components/stream-working";
import {
  actionAfterPinUnlock,
  isResumableSession,
  preferCanonicalLastChat,
  readRememberedLastChat,
  resumeTranscript,
  shouldOfferResume,
  snapshotLastChat,
  writeRememberedLastChat,
  type ResumeChoice,
  type ResumeSessionLike,
} from "@/lib/resume-session";
import { chatRequiresPin, isPinAccessError } from "@/lib/chat-pin";
import {
  BARGE_IN_TAP_HINT,
  conversationMicLabel,
  conversationModeAvailable,
  conversationToggleLabel,
  conversationToggleTitle,
} from "@/lib/conversation-mode";
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
  AudioLines,
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
  const pinRequired = chatRequiresPin({ hasPin: selectedChild.has_pin, quickChat });

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerified, setPinVerified] = useState(!pinRequired);
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
  const conversationActiveRef = useRef(false);
  const pendingChoiceRef = useRef<ResumeChoice | null>(null);
  const offeredSessionRef = useRef<ResumeSessionLike | null>(null);

  const handleVoiceTranscript = useCallback((text: string) => {
    autoReadNextRef.current = true;
    setInput(text);
    void sendRef.current(text, true);
  }, []);

  const {
    conversationActive,
    conversationPhase,
    bargeInWatchFailed,
    toggleConversation,
    stopConversation,
    notifyAssistantDone,
    bargeIn,
    listening,
    transcribing,
    voiceSupported,
    speechError,
    audioLevel,
    interimTranscript,
    heardSpeech,
    toggleListening,
    readAloudSupported,
    readAloudError,
    readAloudState,
    speakMessage,
    stopReadAloud,
    isSpeakingMessage,
  } = useVoiceConversation({
    onTranscript: handleVoiceTranscript,
    voiceGender: selectedChild.voice_gender,
  });

  const stopConversationRef = useRef(stopConversation);
  stopConversationRef.current = stopConversation;
  conversationActiveRef.current = conversationActive;
  const conversationAvailable = conversationModeAvailable({
    voiceSupported,
    readAloudSupported,
  });
  const conversationSpeaking =
    conversationActive &&
    (conversationPhase === "speaking" || readAloudState.isSpeaking || readAloudState.isLoading);

  const handleToggleConversation = () => {
    if (conversationActive) {
      conversationActiveRef.current = false;
      stopConversation();
      return;
    }
    conversationActiveRef.current = true;
    toggleConversation();
  };

  const handleMicClick = () => {
    if (conversationActive && (readAloudState.isSpeaking || readAloudState.isLoading || conversationPhase === "speaking")) {
      bargeIn();
      return;
    }
    if (!conversationActive) {
      stopReadAloud();
    }
    toggleListening();
  };

  useEffect(() => {
    conversationActiveRef.current = false;
    stopConversationRef.current();
    pendingChoiceRef.current = null;
    offeredSessionRef.current = null;
    setPinVerified(!pinRequired);
    setPin("");
    setPinError("");
    setChatSessionId(null);
    setMessages([]);
    setSessionReady(false);
    setResumeOffered(false);
    setResumeChecking(false);
    setStoryPageText({});
    setStarters([]);
    // stopConversation is kept in a ref so voice-hook identity changes cannot
    // re-lock a PIN that was just unlocked (Welcome back → Continue loop).
  }, [selectedChild.id, pinRequired]);

  useEffect(() => {
    if (!pinVerified) return;
    setSimpleMode(localStorage.getItem(simpleModeKey(selectedChild.id)) === "1");
    api.conversationStarters(selectedChild.id).then(setStarters).catch(() => setStarters([]));
  }, [selectedChild.id, pinVerified]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, simpleMode, streaming]);

  const applyResumedSession = useCallback((session: ResumeSessionLike) => {
    const history = resumeTranscript(session);
    if (typeof session.session_id !== "number" || history.length === 0) return false;
    setChatSessionId(session.session_id);
    setMessages(history);
    setResumeOffered(false);
    setResumeChecking(false);
    setSessionReady(true);
    setPinError("");
    pendingChoiceRef.current = null;
    offeredSessionRef.current = session;
    if (!quickChat) writeRememberedLastChat(selectedChild.id, session);
    return true;
  }, [quickChat, selectedChild.id]);

  const canonicalLastChat = useCallback(
    (fetched: ResumeSessionLike | null | undefined) => {
      if (quickChat) return isResumableSession(fetched) ? fetched : null;
      return preferCanonicalLastChat(fetched, readRememberedLastChat(selectedChild.id));
    },
    [quickChat, selectedChild.id],
  );

  const initSession = useCallback(
    async (resume: boolean) => {
      setSessionReady(false);
      setPinError("");

      if (resume && selectedChild.allow_resume !== false) {
        const cached = canonicalLastChat(offeredSessionRef.current);
        if (cached && applyResumedSession(cached)) {
          return;
        }
        try {
          const resumed = await api.resumeSession(selectedChild.id);
          const canonical = canonicalLastChat(resumed);
          if (canonical && applyResumedSession(canonical)) {
            return;
          }
        } catch (error) {
          if (isPinAccessError(error)) {
            pendingChoiceRef.current = "continue";
            setPinVerified(false);
            setResumeOffered(false);
            setResumeChecking(false);
            return;
          }
          // fall through to new session
        }
      }

      try {
        const session = await api.createChatSession(selectedChild.id, undefined, quickChat);
        pendingChoiceRef.current = null;
        setChatSessionId(session.session_id);
        setMessages([]);
        setSessionReady(true);
      } catch (error) {
        if (isPinAccessError(error)) {
          pendingChoiceRef.current = resume ? "continue" : (pendingChoiceRef.current ?? "fresh");
          setPinVerified(false);
          setResumeOffered(false);
          setResumeChecking(false);
          return;
        }
        setPinError(SESSION_ERROR_MESSAGE);
      }
    },
    [applyResumedSession, canonicalLastChat, selectedChild, quickChat],
  );

  useEffect(() => {
    if (!pinVerified || chatSessionId !== null) return;
    let cancelled = false;

    const afterPin = actionAfterPinUnlock({
      pendingChoice: pendingChoiceRef.current,
      allowResume: selectedChild.allow_resume,
      quickChat,
    });

    if (afterPin === "resume") {
      setResumeOffered(false);
      setResumeChecking(false);
      void initSession(true);
      return;
    }

    // Quick Chat is anonymous and shared, so never offer another kid's last chat.
    if (afterPin === "fresh") {
      pendingChoiceRef.current = null;
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
        const canonical = canonicalLastChat(resumed);
        if (shouldOfferResume({ allowResume: selectedChild.allow_resume, quickChat, session: canonical })) {
          offeredSessionRef.current = canonical;
          setResumeOffered(true);
          setResumeChecking(false);
          return;
        }
        offeredSessionRef.current = null;
        setResumeChecking(false);
        void initSession(false);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isPinAccessError(error)) {
          setPinVerified(false);
          setResumeChecking(false);
          return;
        }
        setResumeChecking(false);
        void initSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChild, pinVerified, chatSessionId, initSession, quickChat, canonicalLastChat]);

  useEffect(() => {
    if (quickChat || !sessionReady) return;
    const snapshot = snapshotLastChat(
      chatSessionId,
      messages.map((message) => ({
        role: message.role,
        content: message.content,
        blocked: message.blocked,
      })),
    );
    if (!snapshot) return;
    offeredSessionRef.current = snapshot;
    writeRememberedLastChat(selectedChild.id, snapshot);
  }, [quickChat, sessionReady, chatSessionId, messages, selectedChild.id]);

  const handleNewChat = async () => {
    if (streaming) return;
    conversationActiveRef.current = false;
    stopConversation();
    stopReadAloud();
    const previousSessionId = chatSessionId;
    pendingChoiceRef.current = "fresh";
    offeredSessionRef.current = null;
    setSessionReady(false);
    setResumeOffered(false);
    setResumeChecking(false);
    setStoryPageText({});
    try {
      const session = await api.createChatSession(selectedChild.id, previousSessionId ?? undefined, quickChat);
      pendingChoiceRef.current = null;
      setChatSessionId(session.session_id);
      setMessages([]);
      setSessionReady(true);
    } catch (error) {
      if (isPinAccessError(error)) {
        pendingChoiceRef.current = "fresh";
        setPinVerified(false);
        return;
      }
      setPinError(SESSION_ERROR_MESSAGE);
    }
  };

  const handlePinSubmit = async () => {
    if (!pin.trim()) return;
    try {
      await api.verifyPin(selectedChild.id, pin);
      setPinError("");
      setPin("");
      setPinVerified(true);
      setChatSessionId(null);
      setMessages([]);
      setSessionReady(false);
      setResumeOffered(false);
      setResumeChecking(false);
      // Keep the Continue transcript across a PIN re-ask (#38). Otherwise drop
      // the in-memory cache so Welcome back refetches the canonical last chat.
      if (pendingChoiceRef.current !== "continue") {
        offeredSessionRef.current = null;
      }
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
      // Stopping the recorder to send a tap/chip would transcribe and double-send.
      if (!fromVoice && (listening || transcribing)) return;

      if (fromVoice) autoReadNextRef.current = true;

      if (selectedChild.chat_available === false) {
        setPinError(selectedChild.chat_unavailable_message || "Chat is not available right now.");
        return;
      }
      if (pinRequired && !pinVerified) {
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
            const finishSpokenTurn = (text: string | null, messageKey: string) => {
              if (conversationActiveRef.current) {
                autoReadNextRef.current = false;
                notifyAssistantDone(text ?? "", messageKey);
                return;
              }
              if (!autoReadNextRef.current) return;
              autoReadNextRef.current = false;
              if (text) speakMessage(messageKey, text);
            };
            if (!assistantContent || assistantContent === CHAT_ERROR_MESSAGE) {
              if (conversationActiveRef.current) notifyAssistantDone("");
              return;
            }
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
                  finishSpokenTurn(spokenTextForMessage(prev[idx]), `msg-${idx}`);
                } else if (conversationActiveRef.current) {
                  notifyAssistantDone("");
                } else {
                  autoReadNextRef.current = false;
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
        if (conversationActiveRef.current) {
          notifyAssistantDone("");
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [input, selectedChild, streaming, listening, transcribing, pinRequired, pinVerified, chatSessionId, sessionReady, speakMessage, stopReadAloud, notifyAssistantDone, quickChat],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStreamStatus(null);
    if (conversationActiveRef.current) {
      notifyAssistantDone("");
    } else {
      stopReadAloud();
    }
  }, [notifyAssistantDone, stopReadAloud]);

  useEffect(() => {
    sendRef.current = handleSend;
  }, [handleSend]);

  const handleSwitch = () => {
    conversationActiveRef.current = false;
    stopConversation();
    stopReadAloud();
    onSwitchProfile();
  };

  // PIN screen — named profiles only. Quick Chat is anonymous and skips this gate.
  if (pinRequired && !pinVerified) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${ageConfig.ambientGradient}`}>
        <main className="w-full max-w-md animate-pop-in">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl accent-gradient text-3xl shadow-lg shadow-primary/25">
              {ageConfig.avatarEmoji}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {displayName ?? `Hi, ${selectedChild.name}!`}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Enter your secret PIN to unlock your chat
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
              onClick={() => {
                pendingChoiceRef.current = "continue";
                const offered = canonicalLastChat(offeredSessionRef.current);
                if (isResumableSession(offered) && applyResumedSession(offered)) {
                  return;
                }
                void initSession(true);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Continue last chat
            </Button>
            <Button
              variant="outline"
              className="h-12 text-base font-semibold rounded-xl border-border/80 bg-card/80"
              onClick={() => {
                pendingChoiceRef.current = "fresh";
                offeredSessionRef.current = null;
                void initSession(false);
              }}
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
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 shadow-sm dark:bg-orange-950/40">
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
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur-md px-4 py-3 dark:border-border dark:bg-card/90">
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
                {conversationActive && (
                  <span className="font-semibold text-primary flex items-center gap-1">
                    <AudioLines className="h-3 w-3" />
                    Talking ·
                  </span>
                )}
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
                {selectedChild.open_web_search && (
                  <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Open web search ·
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
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient text-2xl shadow-md shadow-primary/20 animate-bounce-gentle">
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
                      disabled={streaming || listening || transcribing || !sessionReady}
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
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl accent-gradient text-primary-foreground text-xs font-bold shadow-xs mt-1">
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
                          ? "accent-gradient text-white font-medium shadow-orange-200/60 shadow-sm"
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
                      speakSupported={readAloudSupported && !conversationActive}
                      isSpeaking={isSpeakingMessage(`${messageKey}-story`)}
                      speakLoading={readAloudState.isLoading && readAloudState.messageKey === `${messageKey}-story`}
                      onStoryPageText={(text) => {
                        setStoryPageText((prev) => (prev[i] === text ? prev : { ...prev, [i]: text }));
                      }}
                    />
                  )}

                  {streaming &&
                    i === messages.length - 1 &&
                    shouldShowStreamThinking(streaming, msg) && (
                      <StreamWorkingBubble
                        status={streamStatus}
                        simpleMode={simpleMode}
                        onStop={handleStop}
                        showAvatar={false}
                      />
                    )}

                  {/* Speaking indicator / audio player */}
                  {isReading && readAloudState.isSpeaking && (
                    <SpeakingIndicator simpleMode={simpleMode} />
                  )}

                  {/* Listen button — conversation mode reads replies itself */}
                  {isAssistant && readAloudSupported && !streaming && listenText && !msg.blocked && !conversationActive && (
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
                      disabled={streaming || listening || transcribing || !sessionReady}
                      onSend={(text) => {
                        void handleSend(text);
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {shouldShowStreamThinking(streaming, messages[messages.length - 1]) &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <StreamWorkingBubble
                status={streamStatus}
                simpleMode={simpleMode}
                onStop={handleStop}
              />
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

          {conversationAvailable && conversationActive && !listening && (
            <ConversationIndicator
              phase={conversationPhase}
              simpleMode={simpleMode}
              hint={conversationSpeaking && bargeInWatchFailed ? BARGE_IN_TAP_HINT : null}
            />
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

          {streaming && !conversationActive && (
            <StreamComposerHint status={streamStatus} simpleMode={simpleMode} />
          )}

          {conversationAvailable && (
            <Button
              type="button"
              variant={conversationActive ? "default" : "outline"}
              onClick={handleToggleConversation}
              disabled={!sessionReady || transcribing || (!conversationActive && streaming)}
              title={conversationToggleTitle(conversationActive)}
              aria-pressed={conversationActive}
              aria-label={conversationToggleLabel(conversationActive)}
              className={`w-full rounded-2xl font-semibold ${
                simpleMode ? "h-12 text-base" : "h-10 text-sm"
              }`}
            >
              {conversationActive ? (
                <>
                  <Square className="h-4 w-4 fill-current" />
                  <span>{conversationToggleLabel(true)}</span>
                </>
              ) : (
                <>
                  <AudioLines className="h-4 w-4" />
                  <span>{conversationToggleLabel(false)}</span>
                </>
              )}
            </Button>
          )}

          <div className="relative flex items-center gap-2">
            {voiceSupported && (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={handleMicClick}
                disabled={streaming || transcribing || !sessionReady}
                title={conversationMicLabel({
                  conversationActive,
                  speaking: conversationSpeaking,
                  listening,
                })}
                aria-label={conversationMicLabel({
                  conversationActive,
                  speaking: conversationSpeaking,
                  listening,
                })}
                className={`shrink-0 rounded-2xl transition-all ${
                  listening ? "shadow-md shadow-destructive/25 scale-105" : "border-border/80 bg-card hover:bg-primary/5 hover:border-primary/50"
                } ${conversationActive && !listening ? "ring-2 ring-primary/40" : ""} ${simpleMode ? "h-14 w-14" : "h-11 w-11"}`}
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
              enabled={Boolean(selectedChild.homework_mode) && !(quickChat && selectedChild.has_pin)}
              disabled={streaming || listening || transcribing || !sessionReady}
              simpleMode={simpleMode}
            />
            <Input
              placeholder={
                streaming
                  ? "Wait for this answer, or tap Stop…"
                  : displayName
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
