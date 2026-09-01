"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OllamaSetup } from "@/components/ollama-setup";
import { Cloud, KeyRound, Server, Smartphone, Users } from "lucide-react";

export default function SettingsPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [devicesMessage, setDevicesMessage] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [childDraft, setChildDraft] = useState<Partial<Child & { pin: string; clear_pin: boolean }>>({});
  const [childSaveError, setChildSaveError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.me(), api.children(), api.devices()])
      .then(([me, childrenData, devicesData]) => {
        setCloudEnabled(me.cloud_enabled);
        setChildren(childrenData);
        setDevicesMessage(devicesData.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const startEditChild = (child: Child) => {
    setEditingChildId(child.id);
    setChildDraft({ ...child, pin: "", clear_pin: false });
    setChildSaveError("");
  };

  const saveChildSettings = async () => {
    if (!editingChildId) return;
    setChildSaveError("");
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
      setEditingChildId(null);
    } catch (e) {
      setChildSaveError(e instanceof Error ? e.message : "Could not save");
    }
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

  const handleCloudSave = async () => {
    setCloudMessage("");
    try {
      await api.cloudSettings(cloudEnabled, openaiKey || undefined);
      setCloudMessage("Cloud settings saved.");
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : "Could not save");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-muted-foreground">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage child profiles, local AI, and account options.
        </p>
      </div>

      {/* Child profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Child profiles
          </CardTitle>
          <CardDescription>
            Names, safety levels, PINs, homework mode, and quiet hours for each child.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {children.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No child profiles yet.{" "}
              <Link href="/setup" className="text-primary underline-offset-4 hover:underline">
                Finish setup
              </Link>
            </p>
          ) : (
            children.map((child) => (
              <div key={child.id} className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{child.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Age {child.age} · Strictness {child.strictness}/5
                      {child.has_pin && " · PIN set"}
                    </p>
                  </div>
                  {editingChildId !== child.id && (
                    <Button size="sm" variant="outline" onClick={() => startEditChild(child)}>
                      Edit
                    </Button>
                  )}
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
                        Quiet hours
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
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveChildSettings}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingChildId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Local AI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Local AI (Ollama)
          </CardTitle>
          <CardDescription>
            Model status, downloads, and which AI model Homeward uses on this computer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OllamaSetup />
        </CardContent>
      </Card>

      {/* Parent password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Parent password
          </CardTitle>
          <CardDescription>
            Change the password used to sign in to this dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
      </Card>

      {/* Cloud AI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud AI (optional)
          </CardTitle>
          <CardDescription>
            By default Homeward uses local Ollama. You can optionally enable cloud models with your own OpenAI key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cloudEnabled}
              onChange={(e) => setCloudEnabled(e.target.checked)}
              className="accent-primary"
            />
            Enable cloud AI (bring your own key)
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
          {cloudMessage && <p className="text-sm text-muted-foreground">{cloudMessage}</p>}
          <Button onClick={handleCloudSave} size="sm">Save cloud settings</Button>
        </CardContent>
      </Card>

      {/* Devices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Paired devices
          </CardTitle>
          <CardDescription>{devicesMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Future updates will support pairing phones, tablets, and computers. For now, kids can chat in this browser.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
