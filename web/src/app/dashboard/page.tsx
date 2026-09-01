"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { chatPathForChild } from "@/lib/slug";
import { useRouter } from "next/navigation";
import { api, type ChatSessionSummary, type ConversationLog, type BlockedAttempt, type Child } from "@/lib/api";
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
  Settings,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
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

  useEffect(() => {
    const load = async () => {
      try {
        const [sessionsData, blockedData, childrenData, blockedStats, health] = await Promise.all([
          api.sessions(),
          api.blocked(),
          api.children(),
          api.blockedStats().catch(() => ({ today_count: 0, total_count: 0 })),
          api.health().catch(() => ({ status: "degraded", ollama: { ready: false } })),
        ]);
        setSessions(sessionsData);
        setBlocked(blockedData);
        setChildren(childrenData);
        setBlockedToday(blockedStats.today_count);
        setBlockedTotal(blockedStats.total_count);
        setAiReady(health.ollama?.ready ?? health.status === "ok");
      } catch {
        router.replace("/setup");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const childName = (id: number) => children.find((c) => c.id === id)?.name || `Child #${id}`;

  const openSession = async (session: ChatSessionSummary) => {
    setSelectedSession(session);
    setSessionLoading(true);
    try {
      const messages = await api.sessionMessages(session.id);
      setSessionMessages(messages);
    } catch {
      setSessionMessages([]);
    } finally {
      setSessionLoading(false);
    }
  };

  const formatSessionWhen = (startedAt: string, lastAt: string) => {
    const start = new Date(startedAt);
    const end = new Date(lastAt);
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) {
      return `${start.toLocaleDateString()} · ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return `${start.toLocaleString()} – ${end.toLocaleString()}`;
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-muted-foreground">Loading dashboard…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <p className="text-muted-foreground">
          See what your kids have been chatting about and anything Homeward blocked.
        </p>
      </div>

      {/* Overview */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="h-8 w-8 text-primary shrink-0" />
            <div>
              <p className="text-2xl font-bold">{children.length}</p>
              <p className="text-xs text-muted-foreground">Child profile{children.length !== 1 ? "s" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <MessageSquare className="h-8 w-8 text-primary shrink-0" />
            <div>
              <p className="text-2xl font-bold">{sessions.length}</p>
              <p className="text-xs text-muted-foreground">Recent chat session{sessions.length !== 1 ? "s" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={blockedToday > 0 ? "border-amber-300 dark:border-amber-700" : ""}>
          <CardContent className="flex items-center gap-3 pt-6">
            <ShieldAlert className={`h-8 w-8 shrink-0 ${blockedToday > 0 ? "text-amber-600" : "text-primary"}`} />
            <div>
              <p className="text-2xl font-bold">{blockedToday}</p>
              <p className="text-xs text-muted-foreground">Blocked today · {blockedTotal} all time</p>
            </div>
          </CardContent>
        </Card>
        <Card className={aiReady === false ? "border-amber-300 dark:border-amber-700" : ""}>
          <CardContent className="flex items-center gap-3 pt-6">
            <Sparkles className={`h-8 w-8 shrink-0 ${aiReady ? "text-primary" : "text-amber-600"}`} />
            <div>
              <p className="text-lg font-bold">{aiReady ? "Ready" : "Not ready"}</p>
              <p className="text-xs text-muted-foreground">
                Local AI {aiReady ? "is running" : "needs attention — check Settings"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {blockedToday > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100">
              {blockedToday} message{blockedToday !== 1 ? "s" : ""} blocked today
            </p>
            <p className="text-amber-800 dark:text-amber-200">
              Homeward stopped these before they reached the AI. Review them in the Blocked tab below.
            </p>
          </div>
        </div>
      )}

      {/* Children at a glance */}
      {children.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your children</h2>
            <Link href="/dashboard/settings">
              <Button variant="ghost" size="sm">
                <Settings className="mr-2 h-4 w-4" />
                Manage profiles
              </Button>
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <Card key={child.id}>
                <CardContent className="flex items-center justify-between gap-2 pt-6">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Age {child.age} · Safety {child.strictness}/5
                      {child.homework_mode && " · Homework"}
                      {child.quiet_hours_enabled && " · Quiet hours"}
                    </p>
                  </div>
                  <Link href={chatPathForChild(child)}>
                    <Button size="sm" variant="outline">Chat</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Activity tabs */}
      <div className="mb-4 flex gap-2 border-b border-border">
        {[
          { id: "logs" as const, label: "Conversations", icon: MessageSquare },
          {
            id: "blocked" as const,
            label: blockedToday > 0 ? `Blocked (${blockedToday} today)` : "Blocked",
            icon: ShieldAlert,
          },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "logs" && (
        <Card>
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
            <CardDescription>
              Browse chat sessions by visit. Click a session to read the full exchange.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedSession ? (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSession(null);
                    setSessionMessages([]);
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sessions
                </Button>

                <div className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{childName(selectedSession.child_id)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatSessionWhen(selectedSession.started_at, selectedSession.last_at)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {selectedSession.message_count} message{selectedSession.message_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground italic">
                    &ldquo;{selectedSession.preview}&rdquo;
                  </p>
                  {selectedSession.summary && (
                    <p className="mt-3 text-sm border-t border-border pt-3">
                      <span className="font-medium">Summary: </span>
                      {selectedSession.summary}
                    </p>
                  )}
                </div>

                {sessionLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
                ) : sessionMessages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages in this session.</p>
                ) : (
                  <div className="space-y-3">
                    {sessionMessages.map((log) => (
                      <div
                        key={log.id}
                        className={`rounded-lg border p-3 text-sm ${
                          log.blocked
                            ? "border-destructive/30 bg-destructive/5"
                            : log.direction === "input"
                              ? "border-primary/20 bg-primary/5 mr-8"
                              : "border-border bg-card ml-8"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium uppercase text-muted-foreground">
                            {log.direction === "input" ? childName(log.child_id) : "Homeward"}
                            {log.blocked && " · blocked"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{log.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center">
                <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet. Send your kids to Kid Chat to get started.
                </p>
                <Link href="/chat">
                  <Button className="mt-4" variant="outline">Open Kid Chat</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => openSession(session)}
                    className="flex w-full items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
                  >
                    <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{childName(session.child_id)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(session.last_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {session.summary || session.preview}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.message_count} message{session.message_count !== 1 ? "s" : ""}
                        {session.legacy && " · imported session"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "blocked" && (
        <Card>
          <CardHeader>
            <CardTitle>Blocked attempts</CardTitle>
            <CardDescription>
              Messages that were stopped by Homeward&apos;s safety filters before reaching the AI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No blocked attempts — great news!
              </p>
            ) : (
              <div className="space-y-3">
                {blocked.map((a) => (
                  <div key={a.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{childName(a.child_id)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Stage: {a.stage} · {a.reason}</p>
                    <p className="mt-1">{a.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
