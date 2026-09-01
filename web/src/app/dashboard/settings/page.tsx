"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OllamaSetup } from "@/components/ollama-setup";
import { Cloud, KeyRound, Server, Smartphone } from "lucide-react";

export default function SettingsPage() {
  const [devicesMessage, setDevicesMessage] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.me(), api.devices()])
      .then(([me, devicesData]) => {
        setCloudEnabled(me.cloud_enabled);
        setDevicesMessage(devicesData.message);
      })
      .finally(() => setLoading(false));
  }, []);

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
          Local AI, account security, and optional cloud models.
        </p>
      </div>

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
