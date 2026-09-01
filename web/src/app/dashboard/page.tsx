"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ConversationLog, type BlockedAttempt, type Child } from "@/lib/api";
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
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [blocked, setBlocked] = useState<BlockedAttempt[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [devicesMessage, setDevicesMessage] = useState("");
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"logs" | "blocked" | "devices">("logs");

  useEffect(() => {
    const load = async () => {
      try {
        const me = await api.me();
        setCloudEnabled(me.cloud_enabled);
        const [logsData, blockedData, childrenData, devicesData] = await Promise.all([
          api.logs(),
          api.blocked(),
          api.children(),
          api.devices(),
        ]);
        setLogs(logsData);
        setBlocked(blockedData);
        setChildren(childrenData);
        setDevicesMessage(devicesData.message);
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

  const childName = (id: number) => children.find((c) => c.id === id)?.name || `Child #${id}`;

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

        {/* Children overview */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <Card key={child.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{child.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Age {child.age} · Strictness {child.strictness}/5
                  </p>
                </div>
                <Link href={`/chat?child=${child.id}`}>
                  <Button size="sm" variant="outline">Open chat</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 border-b border-border">
          {[
            { id: "logs" as const, label: "Conversations", icon: MessageSquare },
            { id: "blocked" as const, label: "Blocked", icon: ShieldAlert },
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
              <CardDescription>Messages your children sent and received through Homeward.</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No conversations yet. Share the kid chat link with your children to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`rounded-lg border p-3 text-sm ${
                        log.blocked ? "border-destructive/30 bg-destructive/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{childName(log.child_id)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase">
                        {log.direction} {log.blocked && "· blocked"}
                      </span>
                      <p className="mt-1">{log.content}</p>
                    </div>
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
