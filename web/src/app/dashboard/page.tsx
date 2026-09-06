"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { chatPathForChild } from "@/lib/slug";
import { KidChatLink } from "@/components/kid-chat-link";
import { BlockedAttemptCard } from "@/components/blocked-attempt-card";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type ChatSessionSummary,
  type ConversationLog,
  type BlockedAttempt,
  type Child,
} from "@/lib/api";
import { getAgeTheme, AGE_THEME_CONFIGS } from "@/lib/age-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare,
  ShieldAlert,
  ArrowLeft,
  MessageCircle,
  Users,
  Sparkles,
  AlertTriangle,
  Filter,
  CheckCircle2,
  Clock,
  BookOpen,
  Globe,
  ArrowRight,
  ShieldCheck,
  Zap,
  Trash2,
} from "lucide-react";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("child");
  const filterChildId = filterParam ? parseInt(filterParam, 10) : null;
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSessionSummary | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ConversationLog[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [blocked, setBlocked] = useState<BlockedAttempt[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [blockedToday, setBlockedToday] = useState(0);
  const [blockedTotal, setBlockedTotal] = useState(0);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"logs" | "blocked">("logs");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [sessionActionError, setSessionActionError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const childFilter =
          filterChildId && !Number.isNaN(filterChildId) ? filterChildId : undefined;
        const [sessionsData, blockedData, childrenData, blockedStats, health] =
          await Promise.all([
            api.sessions(childFilter),
            api.blocked(childFilter),
            api.children(),
            api.blockedStats(childFilter).catch(() => ({ today_count: 0, total_count: 0 })),
            api.health().catch(() => ({ status: "degraded", ollama: { ready: false } })),
          ]);
        setSessions(sessionsData);
        setBlocked(blockedData);
        setChildren(childrenData);
        setBlockedToday(blockedStats.today_count);
        setBlockedTotal(blockedStats.total_count);
        setAiReady(health.ollama?.ready ?? health.status === "ok");
        setSelectedSession(null);
        setSessionMessages([]);
      } catch {
        router.replace("/setup");
      } finally {
        setLoading(false);
      }
    };
    setLoading(true);
    load();
  }, [router, filterChildId]);

  const setChildFilter = (childId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (childId == null) {
      params.delete("child");
    } else {
      params.set("child", String(childId));
    }
    const query = params.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard");
  };

  const filteredChild = filterChildId ? children.find((c) => c.id === filterChildId) : null;

  const childName = (id: number) => children.find((c) => c.id === id)?.name || `Child #${id}`;

  const openSession = async (session: ChatSessionSummary) => {
    setSelectedSession(session);
    setSessionLoading(true);
    setSessionActionError("");
    try {
      const messages = await api.sessionMessages(session.id);
      setSessionMessages(messages);
    } catch {
      setSessionMessages([]);
      setSessionActionError("Couldn't load this conversation. Check that Homeward is running and try again.");
    } finally {
      setSessionLoading(false);
    }
  };

  const deleteSession = async (session: ChatSessionSummary) => {
    if (
      !window.confirm(
        `Delete this conversation with ${childName(session.child_id)}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingSessionId(session.id);
    setSessionActionError("");
    try {
      await api.deleteSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      if (selectedSession?.id === session.id) {
        setSelectedSession(null);
        setSessionMessages([]);
      }
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Could not delete session");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const deleteAllSessionsForChild = async () => {
    if (!filteredChild) return;
    if (
      !window.confirm(
        `Delete all conversations for ${filteredChild.name}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingAll(true);
    setSessionActionError("");
    try {
      await api.deleteChildSessions(filteredChild.id);
      setSessions([]);
      setSelectedSession(null);
      setSessionMessages([]);
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Could not delete chats");
    } finally {
      setDeletingAll(false);
    }
  };

  const formatSessionWhen = (startedAt: string, lastAt: string) => {
    const start = new Date(startedAt);
    const end = new Date(lastAt);
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
      return `${start.toLocaleDateString()} · ${start.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })} – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return `${start.toLocaleString()} – ${end.toLocaleString()}`;
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Parent Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review chat conversations, active presets, and safety filter events.
            {filteredChild && (
              <span className="block mt-0.5 font-medium text-primary">
                Filtered for {filteredChild.name}
              </span>
            )}
          </p>
        </div>

        <KidChatLink>
          <Button className="rounded-xl shadow-sm shadow-primary/20 font-medium">
            <Sparkles className="mr-2 h-4 w-4" />
            Open Quick Chat
          </Button>
        </KidChatLink>
      </div>

      {/* Child Filter Chips */}
      {children.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Filter className="h-3.5 w-3.5" />
            Filter:
          </span>
          <Button
            size="sm"
            variant={filterChildId == null ? "default" : "outline"}
            onClick={() => setChildFilter(null)}
            className="rounded-full text-xs font-medium h-8 px-3.5"
          >
            All children
          </Button>
          {children.map((child) => {
            const themeKey = getAgeTheme(child);
            const theme = AGE_THEME_CONFIGS[themeKey];
            const isSelected = filterChildId === child.id;

            return (
              <Button
                key={child.id}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => setChildFilter(child.id)}
                className={`rounded-full text-xs font-medium h-8 px-3.5 gap-1.5 transition-all ${
                  isSelected ? "shadow-sm shadow-primary/20" : "hover:border-primary/50"
                }`}
              >
                <span>{theme.avatarEmoji}</span>
                <span>{child.name}</span>
              </Button>
            );
          })}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-border/80 shadow-xs hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-foreground">
                  {children.length}
                </p>
                <p className="text-xs font-medium text-muted-foreground mt-1">
                  Child Profile{children.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/80 shadow-xs hover:shadow-md transition-all">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-foreground">
                  {sessions.length}
                </p>
                <p className="text-xs font-medium text-muted-foreground mt-1">
                  Chat Session{sessions.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
                <MessageSquare className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`relative overflow-hidden border-border/80 shadow-xs hover:shadow-md transition-all ${
            blockedToday > 0 ? "border-amber-500/40 bg-amber-500/5" : ""
          }`}
        >
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              blockedToday > 0
                ? "bg-amber-500"
                : "bg-gradient-to-r from-emerald-500 to-teal-500"
            }`}
          />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-foreground">
                  {blockedToday}
                </p>
                <p className="text-xs font-medium text-muted-foreground mt-1">
                  Blocked today · {blockedTotal} all time
                </p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                  blockedToday > 0
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/10 text-emerald-500"
                }`}
              >
                {blockedToday > 0 ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/80 shadow-xs hover:shadow-md transition-all">
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${
              aiReady ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold tracking-tight text-foreground flex items-center gap-1.5">
                  {aiReady ? "Online" : "Needs Setup"}
                  {aiReady && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </p>
                <p className="text-xs font-medium text-muted-foreground mt-1">
                  {aiReady ? (
                    "Local AI model"
                  ) : (
                    <Link href="/dashboard/settings" className="text-primary underline-offset-4 hover:underline">
                      Fix in Settings →
                    </Link>
                  )}
                </p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                  aiReady
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                <Zap className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Safety Alert Banner */}
      {blockedToday > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm animate-slide-down">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              {blockedToday} message{blockedToday !== 1 ? "s" : ""} prevented today
            </p>
            <p className="text-amber-900/90 dark:text-amber-200/90 text-xs sm:text-sm mt-0.5">
              Homeward stopped these before they reached the model. Switch to the Blocked tab below to inspect details.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTab("blocked")}
            className="rounded-xl border-amber-500/30 bg-card/80 text-xs font-medium shrink-0"
          >
            View blocked
          </Button>
        </div>
      )}

      {/* Children Overview Grid */}
      {children.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Child Profiles
            </h2>
            <Link
              href="/dashboard/profiles"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>Manage profiles</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => {
              const themeKey = getAgeTheme(child);
              const theme = AGE_THEME_CONFIGS[themeKey];
              const isSelected = filterChildId === child.id;

              return (
                <Card
                  key={child.id}
                  className={`relative overflow-hidden transition-all hover:border-primary/50 shadow-xs ${
                    isSelected ? "ring-2 ring-primary border-primary/40 shadow-sm" : ""
                  }`}
                >
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <button
                      type="button"
                      className="flex items-center gap-3 min-w-0 text-left"
                      onClick={() => setChildFilter(child.id)}
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${theme.avatarBg}`}
                      >
                        {theme.avatarEmoji}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground text-base truncate">
                          {child.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {theme.ageRange} · Safety {child.strictness ?? 3}/5
                        </p>
                        {child.homework_mode && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                            <BookOpen className="h-3 w-3" /> Homework mode
                          </span>
                        )}
                        {child.live_lookups && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 mt-0.5">
                            <Globe className="h-3 w-3" /> Live lookups
                          </span>
                        )}
                      </div>
                    </button>
                    <Link href={chatPathForChild(child)}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl h-8 px-3 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
                      >
                        Chat
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity Navigation Tabs */}
      <div className="space-y-4 pt-2">
        <div className="flex gap-2 border-b border-border/70">
          {[
            { id: "logs" as const, label: "Conversations", icon: MessageSquare, count: sessions.length },
            {
              id: "blocked" as const,
              label: "Blocked Attempts",
              icon: ShieldAlert,
              count: blockedToday,
              badgeVariant: blockedToday > 0 ? "amber" : "neutral",
            },
          ].map(({ id, label, icon: Icon, count, badgeVariant }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {typeof count === "number" && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    badgeVariant === "amber" && count > 0
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conversation Logs Tab */}
        {tab === "logs" && (
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold">Recent Chat Sessions</CardTitle>
                  <CardDescription>
                    Select any conversation session to inspect the full kid & assistant dialogue.
                  </CardDescription>
                </div>
                {filteredChild && sessions.length > 0 && !selectedSession && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={deleteAllSessionsForChild}
                    disabled={deletingAll}
                    className="rounded-xl text-xs font-medium text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {deletingAll ? "Deleting…" : `Delete all for ${filteredChild.name}`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sessionActionError && (
                <p className="mb-3 text-xs font-semibold text-destructive">{sessionActionError}</p>
              )}
              {selectedSession ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSession(null);
                        setSessionMessages([]);
                      }}
                      className="rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      Back to all sessions
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteSession(selectedSession)}
                      disabled={deletingSessionId === selectedSession.id}
                      className="rounded-xl text-xs font-medium text-destructive border-destructive/30 hover:bg-destructive/5"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {deletingSessionId === selectedSession.id ? "Deleting…" : "Delete session"}
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-base">
                          {childName(selectedSession.child_id)}
                        </span>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {selectedSession.message_count} messages
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatSessionWhen(selectedSession.started_at, selectedSession.last_at)}
                      </span>
                    </div>
                    {selectedSession.summary && (
                      <p className="text-xs sm:text-sm text-foreground/90 pt-1 border-t border-border/50">
                        <strong className="font-semibold text-primary">Summary: </strong>
                        {selectedSession.summary}
                      </p>
                    )}
                  </div>

                  {sessionLoading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      <Sparkles className="h-6 w-6 animate-pulse text-primary mx-auto mb-2" />
                      Loading messages…
                    </div>
                  ) : sessionMessages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No messages recorded in this session.
                    </p>
                  ) : (
                    <div className="space-y-3 pt-2">
                      {sessionMessages.map((log) => (
                        <div
                          key={log.id}
                          className={`flex ${log.direction === "input" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-xs ${
                              log.blocked
                                ? "border border-destructive/40 bg-destructive/10 text-destructive"
                                : log.direction === "input"
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "border border-border/80 bg-card text-foreground"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-xs mb-1 opacity-80">
                              <span className="font-semibold">
                                {log.direction === "input" ? childName(log.child_id) : "Homeward AI"}
                                {log.blocked && " · 🛑 Blocked"}
                              </span>
                              <span>
                                {new Date(log.created_at).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap">{log.content}</p>
                            {log.block_reason && (
                              <p className="text-xs font-semibold mt-2 pt-1.5 border-t border-destructive/30">
                                Reason: {log.block_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mx-auto">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">No conversations yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When your kids start chatting, their sessions will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex w-full items-start gap-2 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs transition-all hover:border-primary/50 hover:bg-muted/30"
                    >
                      <button
                        type="button"
                        onClick={() => openSession(session)}
                        className="flex min-w-0 flex-1 items-start gap-3.5 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary mt-0.5">
                          <MessageCircle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-foreground text-sm sm:text-base">
                              {childName(session.child_id)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(session.last_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs sm:text-sm text-muted-foreground">
                            {session.summary || session.preview}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                            <span className="rounded-full bg-muted px-2 py-0.5">
                              {session.message_count} message{session.message_count !== 1 ? "s" : ""}
                            </span>
                            {session.legacy && <span>· legacy session</span>}
                          </div>
                        </div>
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Delete this conversation"
                        onClick={() => deleteSession(session)}
                        disabled={deletingSessionId === session.id}
                        className="mt-0.5 h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Blocked Attempts Tab */}
        {tab === "blocked" && (
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Blocked Attempts</CardTitle>
              <CardDescription>
                Policy blocks, classifier timeouts, and AI model errors are labeled separately so
                a safety-check outage is not mistaken for a policy violation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {blocked.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">No blocked messages</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      All conversations have stayed within safety policy guidelines.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {blocked.map((attempt) => (
                    <BlockedAttemptCard
                      key={attempt.id}
                      attempt={attempt}
                      childName={childName(attempt.child_id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
