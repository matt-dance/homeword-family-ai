"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ChatSessionSummary, type ConversationLog, type BlockedAttempt, type Child } from "@/lib/api";
import { HomewardLogo } from "@/components/homeward-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare,
  ShieldAlert,
  Smartphone,
  Cloud,
  LogOut,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Server,
  ArrowLeft,
  MessageCircle,
  KeyRound,
} from "lucide-react";
import { OllamaSetup } from "@/components/ollama-setup";

export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSessionSummary | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ConversationLog[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [blocked, setBlocked] = useState<BlockedAttempt[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [devicesMessage, setDevicesMessage] = useState("");
  const [cloudOpen, setCloudOpen] = useState(false);
  const [ollamaOpen, setOllamaOpen] = useState(true);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"logs" | "blocked" | "devices">("logs");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [blockedToday, setBlockedToday] = useState(0);
  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [childDraft, setChildDraft] = useState<Partial<Child & { pin: string; clear_pin: boolean }>>({});
  const [childSaveMessage, setChildSaveMessage] = useState("");
  const [childSaveError, setChildSaveError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const me = await api.me();
        setCloudEnabled(me.cloud_enabled);
        const [sessionsData, blockedData, childrenData, devicesData, blockedStats] = await Promise.all([
          api.sessions(),
          api.blocked(),
          api.children(),
          api.devices(),
          api.blockedStats().catch(() => ({ today_count: 0, total_count: 0 })),
        ]);
        setSessions(sessionsData);
        setBlocked(blockedData);
        setChildren(childrenData);
        setDevicesMessage(devicesData.message);
        setBlockedToday(blockedStats.today_count);
      } catch {
        router.replace("/setup");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleLogout = async () => {
    await api.logout();
    router.replace("/setup");
  };

  const handleCloudSave = async () => {
    await api.cloudSettings(cloudEnabled, openaiKey || undefined);
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  const childName = (id: number) => children.find((c) => c.id === id)?.name || `Child #${id}`;

  const startEditChild = (child: Child) => {
    setEditingChildId(child.id);
    setChildDraft({
      ...child,
      pin: "",
      clear_pin: false,
    });
    setChildSaveMessage("");
    setChildSaveError("");
  };

  const saveChildSettings = async () => {
    if (!editingChildId) return;
    setChildSaveError("");
    setChildSaveMessage("");
    try {
      const updated = await api.updateChild(editingChildId, {
        name: childDraft.name,
        age: childDraft.age,
        strictness: childDraft.strictness,
        pin: childDraft.pin || undefined,
        clear_pin: childDraft.clear_pin,
        homework_mode: childDraft.homework_mode,
        allow_resume: childDraft.allow_resume,
        quiet_hours_enabled: childDraft.quiet_hours_enabled,
        quiet_hours_start: childDraft.quiet_hours_start || undefined,
        quiet_hours_end: childDraft.quiet_hours_end || undefined,
        quiet_hours_days: childDraft.quiet_hours_days || undefined,
      });
      setChildren((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setChildSaveMessage("Saved!");
      setEditingChildId(null);
    } catch (e) {
      setChildSaveError(e instanceof Error ? e.message : "Could not save");
    }
  };

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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <HomewardLogo />
          <div className="flex items-center gap-2">
            <Link href="/chat">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Kid Chat
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Parent Dashboard</h1>
          <p className="text-muted-foreground">
            Review conversations, blocked attempts, and manage settings.
          </p>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Parent Dashboard</h1>
          <p className="text-muted-foreground">
            Review conversations, blocked attempts, and manage settings.
          </p>
          {blockedToday > 0 && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {blockedToday} blocked attempt{blockedToday !== 1 ? "s" : ""} today — check the Blocked tab.
            </p>
          )}
        </div>

        {/* Children overview + settings */}
        <div className="mb-6 space-y-3">
          {children.map((child) => (
            <Card key={child.id}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{child.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Age {child.age} · Strictness {child.strictness}/5
                      {child.homework_mode && " · Homework mode"}
                      {child.quiet_hours_enabled && " · Quiet hours on"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEditChild(child)}>
                      Edit
                    </Button>
                    <Link href={`/chat?child=${child.id}`}>
                      <Button size="sm" variant="outline">Open chat</Button>
                    </Link>
                  </div>
                </div>

                {editingChildId === child.id && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Name</label>
                        <Input
                          value={childDraft.name || ""}
                          onChange={(e) => setChildDraft({ ...childDraft, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Age</label>
                        <Input
                          type="number"
                          min={3}
                          max={18}
                          value={childDraft.age ?? 8}
                          onChange={(e) => setChildDraft({ ...childDraft, age: parseInt(e.target.value) || 8 })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Strictness ({childDraft.strictness}/5)</label>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={childDraft.strictness ?? 3}
                        onChange={(e) => setChildDraft({ ...childDraft, strictness: parseInt(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Profile PIN (optional)</label>
                      <Input
                        type="password"
                        placeholder={child.has_pin ? "Enter new PIN to change" : "4–6 digits"}
                        value={childDraft.pin || ""}
                        onChange={(e) => setChildDraft({ ...childDraft, pin: e.target.value, clear_pin: false })}
                        maxLength={6}
                      />
                      {child.has_pin && (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={childDraft.clear_pin || false}
                            onChange={(e) => setChildDraft({ ...childDraft, clear_pin: e.target.checked, pin: "" })}
                            className="accent-primary"
                          />
                          Remove PIN
                        </label>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={childDraft.homework_mode || false}
                        onChange={(e) => setChildDraft({ ...childDraft, homework_mode: e.target.checked })}
                        className="accent-primary"
                      />
                      Homework mode (hints only, no full answers)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={childDraft.allow_resume !== false}
                        onChange={(e) => setChildDraft({ ...childDraft, allow_resume: e.target.checked })}
                        className="accent-primary"
                      />
                      Let child resume last chat
                    </label>
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={childDraft.quiet_hours_enabled || false}
                          onChange={(e) => setChildDraft({ ...childDraft, quiet_hours_enabled: e.target.checked })}
                          className="accent-primary"
                        />
                        Quiet hours (limit when chat is available)
                      </label>
                      {childDraft.quiet_hours_enabled && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Start (24h)</label>
                            <Input
                              placeholder="15:00"
                              value={childDraft.quiet_hours_start || ""}
                              onChange={(e) => setChildDraft({ ...childDraft, quiet_hours_start: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">End (24h)</label>
                            <Input
                              placeholder="19:00"
                              value={childDraft.quiet_hours_end || ""}
                              onChange={(e) => setChildDraft({ ...childDraft, quiet_hours_end: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {childSaveError && <p className="text-sm text-destructive">{childSaveError}</p>}
                    {childSaveMessage && <p className="text-sm text-green-700 dark:text-green-400">{childSaveMessage}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveChildSettings}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingChildId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b border-border">
          {[
            { id: "logs" as const, label: "Conversations", icon: MessageSquare },
            { id: "blocked" as const, label: blockedToday > 0 ? `Blocked (${blockedToday} today)` : "Blocked", icon: ShieldAlert },
            { id: "devices" as const, label: "Devices", icon: Smartphone },
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
                                ? "border-primary/20 bg-primary/5 ml-0 mr-8"
                                : "border-border bg-card ml-8 mr-0"
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
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No conversations yet. Share the kid chat link with your children to get started.
                </p>
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
                Messages that were stopped by Homeward&apos;s safety filters.
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

        {tab === "devices" && (
          <Card>
            <CardHeader>
              <CardTitle>Paired devices</CardTitle>
              <CardDescription>{devicesMessage}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Future updates will support pairing phones, tablets, and computers via Tailscale or a browser extension.
                For now, kids can chat directly in this browser.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Ollama section */}
        <Card className="mt-6">
          <button
            onClick={() => setOllamaOpen(!ollamaOpen)}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Local AI (Ollama)</p>
                <p className="text-sm text-muted-foreground">
                  Model status and installation for this computer
                </p>
              </div>
            </div>
            {ollamaOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {ollamaOpen && (
            <CardContent className="border-t border-border pt-4">
              <OllamaSetup />
            </CardContent>
          )}
        </Card>

        {/* Password section */}
        <Card className="mt-6">
          <button
            onClick={() => setPasswordOpen(!passwordOpen)}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Parent password</p>
                <p className="text-sm text-muted-foreground">
                  Change your dashboard password
                </p>
              </div>
            </div>
            {passwordOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {passwordOpen && (
            <CardContent className="space-y-4 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Forgot your password? Sign out and use your recovery code on the sign-in page.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Current password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">New password</label>
                <Input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              {passwordMessage && <p className="text-sm text-green-700 dark:text-green-400">{passwordMessage}</p>}
              <Button onClick={handlePasswordChange} size="sm" disabled={passwordSaving}>
                Update password
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Cloud section - collapsed by default */}
        <Card className="mt-6">
          <button
            onClick={() => setCloudOpen(!cloudOpen)}
            className="flex w-full items-center justify-between p-6 text-left"
          >
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Cloud AI (optional)</p>
                <p className="text-sm text-muted-foreground">
                  Bring your own API key — hidden until you enable it
                </p>
              </div>
            </div>
            {cloudOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {cloudOpen && (
            <CardContent className="space-y-4 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                By default, Homeward uses Ollama on your computer — no internet required for AI responses.
                You can optionally enable cloud models with your own OpenAI API key.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cloudEnabled}
                  onChange={(e) => setCloudEnabled(e.target.checked)}
                  className="accent-primary"
                />
                Enable cloud AI (BYOK)
              </label>
              {cloudEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">OpenAI API Key</label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                  />
                </div>
              )}
              <Button onClick={handleCloudSave} size="sm">Save cloud settings</Button>
            </CardContent>
          )}
        </Card>
      </main>
    </div>
  );
}
