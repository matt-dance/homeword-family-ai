"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OllamaSetup } from "@/components/ollama-setup";
import {
  Cloud,
  KeyRound,
  Server,
  Smartphone,
  CheckCircle2,
  Shield,
  Sparkles,
  Lock,
} from "lucide-react";

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
      setCloudMessage("Cloud settings saved successfully.");
    } catch (e) {
      setCloudMessage(e instanceof Error ? e.message : "Could not save settings");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading settings…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6 animate-fade-in">
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          System & AI Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage local Ollama models, parent dashboard password, and optional cloud fallbacks.
        </p>
      </div>

      {/* Local AI Card */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Local AI Engine (Ollama)
          </CardTitle>
          <CardDescription>
            Download, switch, and monitor models running 100% locally on your hardware.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OllamaSetup />
        </CardContent>
      </Card>

      {/* Parent Password */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Parent Password
          </CardTitle>
          <CardDescription>
            Update the administrator password protecting your dashboard and settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Password
            </label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New Password
            </label>
            <Input
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {passwordError && (
            <p className="text-xs font-semibold text-destructive animate-slide-down">
              {passwordError}
            </p>
          )}
          {passwordMessage && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-slide-down">
              <CheckCircle2 className="h-4 w-4" />
              {passwordMessage}
            </p>
          )}

          <Button
            onClick={handlePasswordChange}
            size="sm"
            disabled={passwordSaving || !currentPassword || !newPassword}
            className="rounded-xl font-medium shadow-xs"
          >
            {passwordSaving ? "Updating…" : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Cloud Fallback */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            Cloud AI Models (Optional)
          </CardTitle>
          <CardDescription>
            Homeward defaults to private local AI. You can optionally route to cloud providers with your own API key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <label className="flex items-center gap-2.5 rounded-xl border border-border/80 p-3.5 text-sm cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={cloudEnabled}
              onChange={(e) => setCloudEnabled(e.target.checked)}
              className="accent-primary rounded h-4 w-4"
            />
            <div>
              <p className="font-semibold text-foreground">
                Enable Cloud AI
              </p>
              <p className="text-xs text-muted-foreground">
                Bring your own OpenAI API key
              </p>
            </div>
          </label>

          {cloudEnabled && (
            <div className="space-y-1.5 animate-slide-down">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                OpenAI API Key
              </label>
              <Input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="rounded-xl font-mono text-xs"
              />
            </div>
          )}

          {cloudMessage && (
            <p className="text-xs font-semibold text-primary animate-slide-down">
              {cloudMessage}
            </p>
          )}

          <Button
            onClick={handleCloudSave}
            size="sm"
            className="rounded-xl font-medium shadow-xs"
          >
            Save Cloud Settings
          </Button>
        </CardContent>
      </Card>

      {/* Network & Connected Devices */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Local Network & Devices
          </CardTitle>
          <CardDescription>
            {devicesMessage || "Access kid chat from any phone, tablet, or laptop on your home Wi-Fi."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-muted/40 p-4 border border-border/60 text-xs sm:text-sm text-muted-foreground leading-relaxed space-y-1">
            <p className="font-semibold text-foreground">
              Connect family devices at: <code className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">http://homeward.local:43123</code>
            </p>
            <p>
              Kids can chat securely from any device on your local network while the Parent Dashboard remains strictly protected on this host computer.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
