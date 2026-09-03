"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_HOMEWARD_URL } from "@/lib/local-host";
import { api, type Preset } from "@/lib/api";
import { HomewardLogo } from "@/components/homeward-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OllamaSetup } from "@/components/ollama-setup";
import { LiveLookupsToggle } from "@/components/live-lookups-toggle";
import { VoiceGenderPicker, type VoiceGender } from "@/components/voice-gender-picker";
import { getAgeTheme, AGE_THEME_CONFIGS } from "@/lib/age-theme";
import {
  Plus,
  Trash2,
  ChevronRight,
  Shield,
  KeyRound,
  Copy,
  Check,
  BookOpen,
  CheckCircle2,
} from "lucide-react";

interface ChildForm {
  name: string;
  age: number;
  preset_id: string;
  strictness: number;
  pin: string;
  homework_mode: boolean;
  live_lookups: boolean;
  voice_gender: VoiceGender;
}

type Step = "login" | "password" | "recovery" | "children" | "model" | "review" | "forgot";

const PIN_PATTERN = /^\d{4,6}$/;

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [savedRecoveryCode, setSavedRecoveryCode] = useState("");
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isResume, setIsResume] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [children, setChildren] = useState<ChildForm[]>([
    { name: "", age: 8, preset_id: "young_explorer", strictness: 4, pin: "", homework_mode: false, live_lookups: false, voice_gender: "female" },
  ]);
  const [ollamaReady, setOllamaReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await api.setupStatus();
        if (s.setup_complete) {
          try {
            await api.me();
            router.replace("/dashboard");
            return;
          } catch {
            setStep("login");
          }
        } else if (s.has_parent) {
          setIsResume(true);
        }
      } catch {
        // fresh install
      } finally {
        setStatusLoaded(true);
      }
    };
    load();
    api.presets().then(setPresets).catch(() => {});
  }, [router]);

  const continueAfterAuth = async () => {
    const existingChildren = await api.children().catch(() => []);
    if (existingChildren.length > 0) {
      setChildren(
        existingChildren.map((c) => ({
          name: c.name,
          age: c.age ?? 8,
          preset_id: c.preset_id ?? "curious_explorer",
          strictness: c.strictness ?? 3,
          pin: "",
          homework_mode: c.homework_mode ?? false,
          live_lookups: c.live_lookups ?? false,
        }))
      );
      setStep("model");
    } else {
      setStep("children");
    }
  };

  const authenticateParent = async () => {
    if (isResume) {
      const result = await api.login(password);
      if (result.setup_complete) {
        router.replace("/dashboard");
        return { continueSetup: false };
      }
      return { continueSetup: true };
    }

    try {
      const result = await api.setup(password);
      if (result.recovery_code) {
        setSavedRecoveryCode(result.recovery_code);
        return { continueSetup: true, showRecovery: true };
      }
      return { continueSetup: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message === "Setup already completed") {
        const result = await api.login(password);
        if (result.setup_complete) {
          router.replace("/dashboard");
          return { continueSetup: false };
        }
        setIsResume(true);
        return { continueSetup: true };
      }
      throw e;
    }
  };

  const presetForAge = (age: number) => {
    const match = presets.find((p) => age >= p.age_min && age <= p.age_max);
    return match?.id || "curious_explorer";
  };

  const handlePasswordSubmit = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await authenticateParent();
      if (result.continueSetup) {
        if (result.showRecovery) {
          setStep("recovery");
        } else {
          await continueAfterAuth();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (password.length < 8) {
      setError("Enter your parent password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.login(password);
      router.replace("/dashboard");
    } catch {
      setError("Incorrect password. Try again or use your recovery code.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (recoveryCode.trim().length < 8) {
      setError("Enter your recovery code");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.resetPassword(recoveryCode.trim(), newPassword);
      setSavedRecoveryCode(result.recovery_code);
      setRecoveryConfirmed(false);
      setStep("recovery");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  const copyRecoveryCode = async () => {
    try {
      await navigator.clipboard.writeText(savedRecoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const addChild = () => {
    setChildren([
      ...children,
      { name: "", age: 10, preset_id: "curious_explorer", strictness: 3, pin: "", homework_mode: false, live_lookups: false, voice_gender: "female" },
    ]);
  };

  const removeChild = (i: number) => {
    setChildren(children.filter((_, idx) => idx !== i));
  };

  const updateChild = (i: number, field: keyof ChildForm, value: string | number | boolean | VoiceGender) => {
    const updated = [...children];
    updated[i] = { ...updated[i], [field]: value };
    if (field === "age") {
      updated[i].preset_id = presetForAge(Number(value));
      const preset = presets.find((p) => p.id === updated[i].preset_id);
      if (preset) updated[i].strictness = preset.strictness_default;
    }
    setChildren(updated);
  };

  const handleChildrenSubmit = async () => {
    const valid = children.every((c) => c.name.trim().length > 0);
    if (!valid) {
      setError("Please enter a name for each child");
      return;
    }
    if (children.some((c) => c.pin.trim() && !PIN_PATTERN.test(c.pin.trim()))) {
      setError("PINs must be 4–6 digits");
      return;
    }
    setLoading(true);
    setError("");
    try {
      for (const child of children) {
        await api.createChild({
          name: child.name.trim(),
          age: child.age,
          preset_id: child.preset_id,
          strictness: child.strictness,
          pin: child.pin.trim() || undefined,
          homework_mode: child.homework_mode,
          live_lookups: child.live_lookups,
          voice_gender: child.voice_gender,
        });
      }
      setStep("model");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add children");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    setError("");
    try {
      await api.completeSetup();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete setup");
    } finally {
      setLoading(false);
    }
  };

  const strictnessLabel = (n: number) => {
    const labels = ["Very relaxed", "Relaxed", "Balanced", "Strict", "Very strict"];
    return labels[n - 1] || "Balanced";
  };

  const setupSteps: Step[] = ["password", "recovery", "children", "model", "review"];
  const currentSetupIndex = setupSteps.indexOf(step);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background flex flex-col">
      <header className="border-b border-border/70 bg-card/85 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <HomewardLogo showTagline />
        <ThemeToggle />
      </header>

      <main className="mx-auto flex-1 max-w-2xl w-full p-4 sm:p-8 animate-fade-in">
        <div className="mb-8 text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {step === "login" || step === "forgot" ? "Parent Sign In" : "Welcome to Homeward"}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {step === "login" || step === "forgot"
              ? "Sign in to manage safety settings and review conversations."
              : "Set up your family\u2019s local AI gateway in just a few minutes."}
          </p>
        </div>

        {currentSetupIndex >= 0 && (
          <div className="mb-8 flex items-center justify-center gap-2">
            {setupSteps.map((s, i) => (
              <div
                key={s}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  step === s
                    ? "w-12 bg-primary shadow-sm shadow-primary/30"
                    : i < currentSetupIndex
                      ? "w-8 bg-emerald-500"
                      : "w-8 bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs sm:text-sm font-semibold text-destructive animate-slide-down">
            {error}
          </div>
        )}

        {step === "login" && (
          <Card className="border-border/80 shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Shield className="h-5 w-5 text-primary" />
                Sign in to Parent Dashboard
              </CardTitle>
              <CardDescription>
                Enter your parent password created during initial setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Parent Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="rounded-xl h-11"
                />
              </div>
              <Button
                onClick={handleLogin}
                disabled={loading || !statusLoaded}
                className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
              >
                Sign In
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setError("");
                  setStep("forgot");
                }}
              >
                Forgot password? Use recovery code
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "forgot" && (
          <Card className="border-border/80 shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <KeyRound className="h-5 w-5 text-primary" />
                Reset Parent Password
              </CardTitle>
              <CardDescription>
                Enter the emergency recovery code provided when you installed Homeward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="recovery-code">Recovery Code</Label>
                <Input
                  id="recovery-code"
                  placeholder="HOME-ABCD-EFGH-JKMN"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  className="rounded-xl font-mono text-xs uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <Button
                onClick={handleForgotSubmit}
                disabled={loading}
                className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
              >
                Reset Password
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep("login")}
                className="w-full rounded-xl text-xs text-muted-foreground"
              >
                Back to sign in
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "password" && (
          <Card className="border-border/80 shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Shield className="h-5 w-5 text-primary" />
                {isResume ? "Continue Setup" : "Create Your Parent Password"}
              </CardTitle>
              <CardDescription>
                {isResume
                  ? "Enter the administrator password you created earlier to continue."
                  : "This password protects your dashboard and settings. Kids will chat using their own child profiles."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Parent Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>
              <Button
                onClick={handlePasswordSubmit}
                disabled={loading || !statusLoaded}
                className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
              >
                {statusLoaded ? "Continue" : "Loading…"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "recovery" && (
          <Card className="border-border/80 shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <KeyRound className="h-5 w-5 text-primary" />
                Save Your Recovery Code
              </CardTitle>
              <CardDescription>
                Keep this code somewhere safe at home. Because Homeward runs 100% locally on your computer with no cloud tracking, this is the only way to recover access if you forget your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 text-center space-y-3">
                <p className="font-mono text-xl sm:text-2xl tracking-wider font-bold text-foreground">
                  {savedRecoveryCode}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyRecoveryCode}
                  className="rounded-xl text-xs font-semibold"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
                      Copied to clipboard
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy code
                    </>
                  )}
                </Button>
              </div>
              <label className="flex items-center gap-2.5 rounded-xl border border-border/80 p-3.5 text-xs sm:text-sm font-medium cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={recoveryConfirmed}
                  onChange={(e) => setRecoveryConfirmed(e.target.checked)}
                  className="accent-primary rounded h-4 w-4"
                />
                <span>I have saved this recovery code in a safe place</span>
              </label>
              <Button
                onClick={() => (isResume ? router.replace("/dashboard") : continueAfterAuth())}
                disabled={!recoveryConfirmed}
                className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "children" && (
          <div className="space-y-4">
            <Card className="border-border/80 shadow-xs rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Add Your Children</CardTitle>
                <CardDescription>
                  Set up profiles for each child with age-appropriate safety presets and optional PIN locks.
                </CardDescription>
              </CardHeader>
            </Card>

            {children.map((child, i) => {
              const themeKey = getAgeTheme(child);
              const theme = AGE_THEME_CONFIGS[themeKey];

              return (
                <Card key={i} className="border-border/80 shadow-xs rounded-2xl overflow-hidden">
                  <div className="border-b border-border/60 bg-muted/30 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-base">
                        {theme.avatarEmoji}
                      </span>
                      <span className="font-bold text-sm text-foreground">
                        Child {i + 1} {child.name ? `· ${child.name}` : ""}
                      </span>
                    </div>
                    {children.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeChild(i)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <CardContent className="pt-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input
                          placeholder="e.g. Avery"
                          value={child.name}
                          onChange={(e) => updateChild(i, "name", e.target.value)}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Age</Label>
                        <Input
                          type="number"
                          min={3}
                          max={18}
                          value={child.age}
                          onChange={(e) => updateChild(i, "age", parseInt(e.target.value, 10) || 8)}
                          className="rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <Label>
                          Safety Strictness: {strictnessLabel(child.strictness)}
                        </Label>
                        <span className="font-bold text-primary">{child.strictness}/5</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={child.strictness}
                        onChange={(e) => updateChild(i, "strictness", parseInt(e.target.value, 10))}
                        className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        Matched preset: <strong className="text-foreground">{theme.title}</strong> ({theme.ageRange})
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 pt-1">
                      <div className="space-y-1.5">
                        <Label>Profile PIN (optional)</Label>
                        <Input
                          type="password"
                          placeholder="4–6 digits"
                          value={child.pin}
                          onChange={(e) => updateChild(i, "pin", e.target.value)}
                          maxLength={6}
                          className="rounded-xl font-mono"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 rounded-xl border border-border/80 p-2.5 w-full text-xs font-medium cursor-pointer hover:bg-muted/30">
                          <input
                            type="checkbox"
                            checked={child.homework_mode}
                            onChange={(e) => updateChild(i, "homework_mode", e.target.checked)}
                            className="accent-primary rounded h-4 w-4"
                          />
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 text-primary" />
                            Homework Mode
                          </span>
                        </label>
                      </div>
                    </div>
                    <VoiceGenderPicker
                      value={child.voice_gender}
                      onChange={(value) => updateChild(i, "voice_gender", value)}
                    />
                    <LiveLookupsToggle
                      compact
                      checked={child.live_lookups}
                      onChange={(value) => updateChild(i, "live_lookups", value)}
                    />
                  </CardContent>
                </Card>
              );
            })}

            <Button
              variant="outline"
              onClick={addChild}
              className="w-full h-11 rounded-2xl border-dashed border-border/90 text-muted-foreground hover:text-foreground"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another child
            </Button>

            <Button
              onClick={handleChildrenSubmit}
              disabled={loading}
              className="w-full h-11 rounded-xl font-semibold shadow-sm shadow-primary/20"
            >
              Continue to AI Model Setup
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === "model" && (
          <OllamaSetup
            onReadyChange={setOllamaReady}
            showContinue
            continueLabel="Continue to review"
            onContinue={() => setStep("review")}
            loading={loading}
          />
        )}

        {step === "review" && (
          <Card className="border-border/80 shadow-md rounded-2xl animate-pop-in">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 mb-2">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold">You&apos;re all set!</CardTitle>
              <CardDescription>
                Homeward is fully configured. Your kids can start chatting, and you can review conversations from the parent dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>
                    <strong>{children.length}</strong> child profile{children.length !== 1 ? "s" : ""} created
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className={`h-4 w-4 ${ollamaReady ? "text-emerald-500" : "text-amber-500"}`} />
                  <span>
                    Local Ollama AI engine {ollamaReady ? "(active and ready)" : "(still downloading — chat waits until it finishes)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>All conversations logged privately on this computer</span>
                </div>
              </div>
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-xs sm:text-sm space-y-1">
                <p className="font-semibold text-foreground">
                  Kids can chat from phones and tablets on your Wi‑Fi at{" "}
                  <code className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">
                    {DEFAULT_HOMEWARD_URL}/chat
                  </code>
                </p>
                <p className="text-muted-foreground">
                  On this computer, use{" "}
                  <code className="font-mono">http://localhost</code> for setup and the
                  parent dashboard.
                </p>
              </div>
              {error && (
                <p className="text-sm font-medium text-destructive text-center">{error}</p>
              )}
              <Button
                onClick={handleComplete}
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold shadow-sm shadow-primary/25"
              >
                Go to Parent Dashboard
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
