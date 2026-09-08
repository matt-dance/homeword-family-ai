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
  Sparkles,
  AlertTriangle,
  Filter,
  Clock,
  ShieldCheck,
  Zap,
  Trash2,
  PlusCircle,
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
      <main className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl animate-fade-in space-y-8 p-4 sm:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-foreground">Welcome back</h1>
          <p className="mt-1 text-slate-500">
            Here&apos;s what your family has been exploring with AI.
          </p>
        </div>
        <KidChatLink>
          <Button className="rounded-2xl font-bold">
            <Sparkles className="mr-2 h-4 w-4" />
            Open Quick Chat
          </Button>
        </KidChatLink>
      </header>

      {children.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </span>
          <Button
            size="sm"
            variant={filterChildId == null ? "default" : "outline"}
            onClick={() => setChildFilter(null)}
            className="h-8 rounded-full px-3.5 text-xs"
          >
            All children
          </Button>
          {children.map((child) => {
            const theme = AGE_THEME_CONFIGS[getAgeTheme(child)];
            return (
              <Button
                key={child.id}
                size="sm"
                variant={filterChildId === child.id ? "default" : "outline"}
                onClick={() => setChildFilter(child.id)}
                className="h-8 gap-1.5 rounded-full px-3.5 text-xs"
              >
                <span>{theme.avatarEmoji}</span>
                <span>{child.name}</span>
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <div className="space-y-8 xl:col-span-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => {
              const theme = AGE_THEME_CONFIGS[getAgeTheme(child)];
              const childSessions = sessions.filter((session) => session.child_id === child.id).length;
              return (
                <div
                  key={child.id}
                  className="group relative overflow-hidden rounded-4xl border border-slate-50 bg-white p-6 card-shadow dark:border-border dark:bg-card"
                >
                  <div
                    className={`absolute -right-4 -top-4 h-24 w-24 rounded-bl-[4rem] transition-all group-hover:scale-110 ${theme.cardBlob}`}
                  />
                  <Link
                    href={`/dashboard/profiles?child=${child.id}`}
                    className="relative z-10 block w-full text-left"
                  >
                    <div
                      className={`mb-4 flex h-16 w-16 items-center justify-center rounded-3xl text-2xl ${theme.cardAvatar} ${theme.avatarBg}`}
                    >
                      {theme.avatarEmoji}
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-foreground">{child.name}</h3>
                    <p className="mb-4 text-sm text-slate-500">
                      {child.age ? `${child.age} years old` : theme.ageRange} · Safety {child.strictness ?? 3}/5
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-badge-safe rounded-full px-3 py-1 text-xs font-bold">
                        {childSessions} Chat{childSessions === 1 ? "" : "s"}
                      </span>
                      {child.homework_mode ? (
                        <span className="status-badge-review rounded-full px-3 py-1 text-xs font-bold">Homework</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-muted">
                          {theme.title}
                        </span>
                      )}
                    </div>
                  </Link>
                  <Link href={chatPathForChild(child)} className="relative z-10 mt-4 block">
                    <Button variant="outline" size="sm" className="w-full rounded-xl text-xs">
                      Open chat
                    </Button>
                  </Link>
                </div>
              );
            })}
            <Link
              href="/dashboard/profiles"
              className="flex flex-col items-center justify-center gap-2 rounded-4xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 dark:border-border dark:bg-muted/40"
            >
              <PlusCircle className="h-8 w-8" />
              <span className="font-bold">Add Child</span>
            </Link>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 p-6 dark:border-border">
              <div>
                <CardTitle className="text-xl font-bold text-slate-800 dark:text-foreground">
                  {tab === "logs" ? "Recent Activity" : "Blocked Attempts"}
                </CardTitle>
                <CardDescription>
                  {tab === "logs"
                    ? "Select a conversation to review the full kid and assistant dialogue."
                    : "Policy blocks and model errors are labeled separately."}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTab("logs")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold ${
                    tab === "logs" ? "bg-blue-50 text-blue-600 dark:bg-primary/15 dark:text-primary" : "text-slate-400"
                  }`}
                >
                  Chats
                </button>
                <button
                  type="button"
                  onClick={() => setTab("blocked")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold ${
                    tab === "blocked" ? "bg-blue-50 text-blue-600 dark:bg-primary/15 dark:text-primary" : "text-slate-400"
                  }`}
                >
                  Blocked
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sessionActionError ? (
                <p className="px-6 pt-4 text-xs font-semibold text-destructive">{sessionActionError}</p>
              ) : null}

              {tab === "logs" && selectedSession ? (
                <div className="space-y-4 p-6 animate-fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSession(null);
                        setSessionMessages([]);
                      }}
                      className="rounded-xl text-xs"
                    >
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      Back to all sessions
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteSession(selectedSession)}
                      disabled={deletingSessionId === selectedSession.id}
                      className="rounded-xl text-xs text-destructive"
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {deletingSessionId === selectedSession.id ? "Deleting…" : "Delete session"}
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-slate-50 bg-slate-50/80 p-4 dark:border-border dark:bg-muted/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-foreground">
                          {childName(selectedSession.child_id)}
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:bg-primary/15 dark:text-primary">
                          {selectedSession.message_count} messages
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatSessionWhen(selectedSession.started_at, selectedSession.last_at)}
                      </span>
                    </div>
                    {selectedSession.summary ? (
                      <p className="border-t border-slate-100 pt-1 text-sm text-slate-600 dark:border-border dark:text-muted-foreground">
                        <strong className="font-semibold text-primary">Summary: </strong>
                        {selectedSession.summary}
                      </p>
                    ) : null}
                  </div>
                  {sessionLoading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      <Sparkles className="mx-auto mb-2 h-6 w-6 animate-pulse text-primary" />
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
                            className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                              log.blocked
                                ? "border border-destructive/40 bg-destructive/10 text-destructive"
                                : log.direction === "input"
                                  ? "bg-slate-900 text-white font-medium dark:bg-white dark:text-slate-900"
                                  : "border border-slate-50 bg-white text-slate-800 dark:border-border dark:bg-card dark:text-foreground"
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs opacity-80">
                              <span className="font-semibold">
                                {log.direction === "input" ? childName(log.child_id) : "Homeward AI"}
                                {log.blocked ? " · Blocked" : ""}
                              </span>
                              <span>
                                {new Date(log.created_at).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap">{log.content}</p>
                            {log.block_reason ? (
                              <p className="mt-2 border-t border-destructive/30 pt-1.5 text-xs font-semibold">
                                Reason: {log.block_reason}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {tab === "logs" && !selectedSession ? (
                sessions.length === 0 ? (
                  <div className="space-y-3 py-12 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-muted">
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <p className="font-semibold text-slate-800 dark:text-foreground">No conversations yet</p>
                    <p className="text-xs text-slate-500">When your kids start chatting, their sessions will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-border">
                    {filteredChild && sessions.length > 0 ? (
                      <div className="flex justify-end px-6 pt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={deleteAllSessionsForChild}
                          disabled={deletingAll}
                          className="rounded-xl text-xs text-destructive"
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          {deletingAll ? "Deleting…" : `Delete all for ${filteredChild.name}`}
                        </Button>
                      </div>
                    ) : null}
                    {sessions.map((session) => {
                      const child = children.find((entry) => entry.id === session.child_id);
                      const theme = AGE_THEME_CONFIGS[getAgeTheme(child)];
                      return (
                        <div key={session.id} className="flex items-start gap-4 p-6 transition-colors hover:bg-slate-50 dark:hover:bg-muted/40">
                          <button
                            type="button"
                            onClick={() => openSession(session)}
                            className="flex min-w-0 flex-1 items-start gap-4 text-left"
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm ${theme.cardAvatar}`}
                            >
                              {theme.avatarEmoji}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <h4 className="font-bold text-slate-800 dark:text-foreground">
                                  {childName(session.child_id)}{" "}
                                  <span className="font-normal text-slate-400">chatted</span>
                                </h4>
                                <span className="shrink-0 text-xs text-slate-400">
                                  {new Date(session.last_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="mt-2 line-clamp-1 text-sm italic text-slate-600 dark:text-muted-foreground">
                                “{session.summary || session.preview}”
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="status-badge-safe flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase">
                                  <ShieldCheck className="h-3 w-3" />
                                  {session.message_count} messages
                                </span>
                                {session.legacy ? (
                                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-600 dark:bg-primary/15 dark:text-primary">
                                    Legacy
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1 rounded-xl text-sm"
                            onClick={() => openSession(session)}
                          >
                            Review
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Delete this conversation"
                            onClick={() => deleteSession(session)}
                            disabled={deletingSessionId === session.id}
                            className="mt-1 h-9 w-9 rounded-xl text-slate-400 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}

              {tab === "blocked" ? (
                <div className="space-y-3 p-6">
                  {blocked.length === 0 ? (
                    <div className="space-y-3 py-12 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                        <ShieldCheck className="h-6 w-6" />
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-foreground">No blocked messages</p>
                      <p className="text-xs text-slate-500">All conversations have stayed within safety guidelines.</p>
                    </div>
                  ) : (
                    blocked.map((attempt) => (
                      <BlockedAttemptCard
                        key={attempt.id}
                        attempt={attempt}
                        childName={childName(attempt.child_id)}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8 xl:col-span-4">
          <Card className="p-6">
            <h2 className="mb-6 text-xl font-bold text-slate-800 dark:text-foreground">Gateway Status</h2>
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    blockedToday > 0 ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500"
                  }`}
                >
                  {blockedToday > 0 ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-foreground">
                    {blockedToday > 0 ? `${blockedToday} blocked today` : "Active Filter"}
                  </p>
                  <p className="text-xs text-slate-500">{blockedTotal} blocked all time</p>
                </div>
                <div className="ml-auto">
                  <div
                    className={`h-2 w-2 rounded-full ${blockedToday > 0 ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-foreground">{sessions.length} sessions</p>
                  <p className="text-xs text-slate-500">
                    {children.length} child profile{children.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    aiReady ? "bg-emerald-50 text-emerald-500" : "bg-amber-50 text-amber-500"
                  }`}
                >
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-foreground">
                    {aiReady ? "Local model online" : "Needs setup"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {aiReady ? "Running on this computer" : "Finish Ollama setup in Settings"}
                  </p>
                </div>
              </div>
            </div>
            <Link href="/dashboard/profiles">
              <Button className="mt-8 w-full rounded-2xl py-4 font-bold">Adjust Filters</Button>
            </Link>
          </Card>

          {blockedToday > 0 ? (
            <div className="flex items-start gap-3 rounded-4xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  {blockedToday} message{blockedToday === 1 ? "" : "s"} prevented today
                </p>
                <p className="mt-0.5 text-xs text-amber-900/90 dark:text-amber-200/90">
                  Homeward stopped these before they reached the model.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setTab("blocked")} className="rounded-xl text-xs">
                View
              </Button>
            </div>
          ) : null}

          <div className="accent-gradient relative overflow-hidden rounded-4xl p-6 text-white card-shadow">
            <Sparkles className="absolute -bottom-4 -right-4 h-24 w-24 text-white/10" />
            <h3 className="mb-2 text-lg font-bold">Privacy First AI</h3>
            <p className="mb-6 text-sm leading-relaxed text-white/90">
              Homeward is running entirely on this computer. No chat logs, personal data, or voice recordings ever leave your network.
            </p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-bold transition-all hover:bg-white/30"
            >
              Review settings
            </Link>
          </div>
        </div>
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
