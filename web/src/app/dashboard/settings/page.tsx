"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { DEFAULT_HOMEWARD_URL } from "@/lib/local-host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OllamaSetup } from "@/components/ollama-setup";
import {
  Cloud,
  KeyRound,
  MapPin,
  Server,
  Smartphone,
  CheckCircle2,
  Shield,
  Sparkles,
  Lock,
  ChevronDown,
  SlidersHorizontal,
  Users,
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
  const [homeLocation, setHomeLocation] = useState("");
  const [homeLabel, setHomeLabel] = useState<string | null>(null);
  const [homeTimezone, setHomeTimezone] = useState<string | null>(null);
  const [homeMessage, setHomeMessage] = useState("");
  const [homeError, setHomeError] = useState("");
  const [homeSaving, setHomeSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [defaultProfileChildId, setDefaultProfileChildId] = useState<number | null>(null);
  const [classifierEnabled, setClassifierEnabled] = useState(true);
  const [aiTone, setAiTone] = useState<"warm" | "balanced" | "concise">("balanced");
  const [aiVerbosity, setAiVerbosity] = useState(3);
  const [advancedChildren, setAdvancedChildren] = useState<
    Array<{ id: number; name: string; slug: string; has_pin: boolean }>
  >([]);
  const [advancedMessage, setAdvancedMessage] = useState("");
  const [advancedError, setAdvancedError] = useState("");
  const [advancedSaving, setAdvancedSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.me(), api.devices(), api.homeLocation(), api.advancedSettings()])
      .then(([me, devicesData, home, advanced]) => {
        setCloudEnabled(me.cloud_enabled);
        setDevicesMessage(devicesData.message);
        setHomeLocation(home.location || "");
        setHomeLabel(home.label);
        setHomeTimezone(home.timezone);
        setDefaultProfileChildId(advanced.default_profile_child_id);
        setClassifierEnabled(advanced.classifier_enabled);
        setAiTone(advanced.ai_tone);
        setAiVerbosity(advanced.ai_verbosity);
        setAdvancedChildren(advanced.children);
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

  const handleHomeLocationSave = async () => {
    setHomeSaving(true);
    setHomeError("");
    setHomeMessage("");
    try {
      const result = await api.updateHomeLocation(homeLocation.trim() || null);
      setHomeLocation(result.location || "");
      setHomeLabel(result.label);
      setHomeTimezone(result.timezone);
      setHomeMessage(
        result.label
          ? `Saved home location: ${result.label}`
          : "Home location cleared.",
      );
    } catch (e) {
      setHomeError(e instanceof Error ? e.message : "Could not save home location");
    } finally {
      setHomeSaving(false);
    }
  };

  const handleAdvancedSave = async () => {
    setAdvancedSaving(true);
    setAdvancedError("");
    setAdvancedMessage("");
    try {
      const result = await api.updateAdvancedSettings({
        default_profile_child_id: defaultProfileChildId,
        classifier_enabled: classifierEnabled,
        ai_tone: aiTone,
        ai_verbosity: aiVerbosity,
      });
      setDefaultProfileChildId(result.default_profile_child_id);
      setClassifierEnabled(result.classifier_enabled);
      setAiTone(result.ai_tone as "warm" | "balanced" | "concise");
      setAiVerbosity(result.ai_verbosity);
      setAdvancedMessage("Advanced settings saved.");
    } catch (e) {
      setAdvancedError(e instanceof Error ? e.message : "Could not save advanced settings");
    } finally {
      setAdvancedSaving(false);
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

      {/* Home location */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Home Location
          </CardTitle>
          <CardDescription>
            Tell Homeward where your family lives so kids can ask about local weather and time
            without naming a city every time. This stays on your home server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              City or town
            </label>
            <Input
              placeholder="Denver, CO"
              value={homeLocation}
              onChange={(e) => setHomeLocation(e.target.value)}
              className="rounded-xl"
            />
            {homeLabel && (
              <p className="text-xs text-muted-foreground">
                Resolved as <span className="font-semibold text-foreground">{homeLabel}</span>
                {homeTimezone ? ` · ${homeTimezone}` : ""}
              </p>
            )}
          </div>

          {homeError && (
            <p className="text-xs font-semibold text-destructive">{homeError}</p>
          )}
          {homeMessage && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {homeMessage}
            </p>
          )}

          <Button
            onClick={handleHomeLocationSave}
            size="sm"
            disabled={homeSaving}
            className="rounded-xl font-medium shadow-xs"
          >
            {homeSaving ? "Saving…" : "Save Home Location"}
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

      {/* Advanced AI & safety controls */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Advanced Settings
              </CardTitle>
              <CardDescription className="mt-1.5">
                Fine-tune AI tone, safety checks, and the default profile for quick chat.
              </CardDescription>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${
                advancedOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CardHeader>
        {advancedOpen && (
          <CardContent className="space-y-6 max-w-lg border-t border-border/60 pt-5 animate-slide-down">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Default profile for quick chat
              </label>
              <select
                value={defaultProfileChildId ?? ""}
                onChange={(e) =>
                  setDefaultProfileChildId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full rounded-xl border border-border/80 bg-background px-3 py-2 text-sm"
              >
                <option value="">Auto (prefer profile without PIN)</option>
                {advancedChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                    {child.has_pin ? " (PIN)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Used for the dashboard Kid Chat button and the quick-start option on new devices.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI tone
              </label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value as "warm" | "balanced" | "concise")}
                className="w-full rounded-xl border border-border/80 bg-background px-3 py-2 text-sm"
              >
                <option value="warm">Warm &amp; encouraging</option>
                <option value="balanced">Balanced (default)</option>
                <option value="concise">Concise &amp; direct</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Response length: {aiVerbosity}
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={aiVerbosity}
                onChange={(e) => setAiVerbosity(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                1 = very brief · 5 = more detailed explanations
              </p>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-border/80 p-3.5 text-sm cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={classifierEnabled}
                onChange={(e) => setClassifierEnabled(e.target.checked)}
                className="accent-primary rounded h-4 w-4 mt-0.5"
              />
              <div>
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  AI safety classifier
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Extra LLM check on messages in and out. Per-child strictness sliders on{" "}
                  <Link href="/dashboard/profiles" className="text-primary underline-offset-2 hover:underline">
                    Profiles
                  </Link>{" "}
                  still apply.
                </p>
              </div>
            </label>

            {advancedError && (
              <p className="text-xs font-semibold text-destructive">{advancedError}</p>
            )}
            {advancedMessage && (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {advancedMessage}
              </p>
            )}

            <Button
              onClick={handleAdvancedSave}
              size="sm"
              disabled={advancedSaving}
              className="rounded-xl font-medium shadow-xs"
            >
              {advancedSaving ? "Saving…" : "Save Advanced Settings"}
            </Button>
          </CardContent>
        )}
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
              Connect family devices at:{" "}
              <code className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">
                {DEFAULT_HOMEWARD_URL}
              </code>
            </p>
            <p>
              Kids can chat securely from any device on your local network while the Parent Dashboard
              remains strictly protected on this host computer.
            </p>
            <p className="text-[11px]">
              Native dev without Docker? Run <code className="font-mono">npm run dev:lan</code> (port 80,
              may require sudo) or <code className="font-mono">npm run dev</code> on port 43123.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
