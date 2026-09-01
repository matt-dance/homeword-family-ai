"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Preset } from "@/lib/api";
import { HomewardLogo } from "@/components/homeward-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OllamaSetup } from "@/components/ollama-setup";
import { Plus, Trash2, ChevronRight, Shield, KeyRound, Copy, Check } from "lucide-react";

interface ChildForm {
  name: string;
  age: number;
  preset_id: string;
  strictness: number;
}

type Step = "login" | "password" | "recovery" | "children" | "model" | "review" | "forgot";

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
    { name: "", age: 8, preset_id: "young_explorer", strictness: 4 },
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
    setChildren([...children, { name: "", age: 10, preset_id: "curious_explorer", strictness: 3 }]);
  };

  const removeChild = (i: number) => {
    setChildren(children.filter((_, idx) => idx !== i));
  };

  const updateChild = (i: number, field: keyof ChildForm, value: string | number) => {
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
    setLoading(true);
    setError("");
    try {
      for (const child of children) {
        await api.createChild({
          name: child.name.trim(),
          age: child.age,
          preset_id: child.preset_id,
          strictness: child.strictness,
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 to-background dark:from-slate-900/50">
      <header className="border-b border-border bg-card/80 backdrop-blur p-4">
        <HomewardLogo />
      </header>

      <main className="mx-auto max-w-2xl p-4 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold">Welcome to Homeward</h1>
          <p className="mt-2 text-muted-foreground">
            {step === "login" || step === "forgot"
              ? "Sign in to your parent dashboard."
              : "Set up your family\u2019s AI safety gateway in a few minutes. Everything runs locally on your computer."}
          </p>
        </div>

        {currentSetupIndex >= 0 && (
          <div className="mb-6 flex justify-center gap-2">
            {setupSteps.map((s, i) => (
              <div
                key={s}
                className={`h-2 w-12 sm:w-16 rounded-full transition-colors ${
                  step === s
                    ? "bg-primary"
                    : i < currentSetupIndex
                      ? "bg-accent"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === "login" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Parent sign in
              </CardTitle>
              <CardDescription>
                Enter the password you created during setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-password">Parent password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <Button onClick={handleLogin} disabled={loading || !statusLoaded} className="w-full">
                Sign in
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="w-full text-sm text-primary underline-offset-4 hover:underline"
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Reset parent password
              </CardTitle>
              <CardDescription>
                Enter the recovery code you saved during setup, then choose a new password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-code">Recovery code</Label>
                <Input
                  id="recovery-code"
                  placeholder="HOME-ABCD-EFGH-JKMN"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <Button onClick={handleForgotSubmit} disabled={loading} className="w-full">
                Reset password
              </Button>
              <Button variant="ghost" onClick={() => setStep("login")} className="w-full">
                Back to sign in
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "password" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {isResume ? "Continue setup" : "Create your parent password"}
              </CardTitle>
              <CardDescription>
                {isResume
                  ? "Enter the parent password you created earlier to finish setting up Homeward."
                  : "This password protects your dashboard. Kids won\u2019t need it \u2014 they\u2019ll use their own profile."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Parent password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button onClick={handlePasswordSubmit} disabled={loading || !statusLoaded} className="w-full">
                {statusLoaded ? "Continue" : "Loading..."}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "recovery" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Save your recovery code
              </CardTitle>
              <CardDescription>
                Write this code down and keep it somewhere safe at home. It is the only way to reset your password if you forget it &mdash; Homeward runs locally, so there is no email reset.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
                <p className="font-mono text-lg sm:text-xl tracking-wider font-semibold">{savedRecoveryCode}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={copyRecoveryCode}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? "Copied" : "Copy code"}
                </Button>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recoveryConfirmed}
                  onChange={(e) => setRecoveryConfirmed(e.target.checked)}
                  className="mt-1 accent-primary"
                />
                I have saved this recovery code in a safe place
              </label>
              <Button
                onClick={() => (isResume ? router.replace("/dashboard") : continueAfterAuth())}
                disabled={!recoveryConfirmed}
                className="w-full"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "children" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add your children</CardTitle>
                <CardDescription>
                  Each child gets age-appropriate safety settings. You can adjust strictness with a simple slider.
                </CardDescription>
              </CardHeader>
            </Card>

            {children.map((child, i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Child {i + 1}</span>
                    {children.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeChild(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        placeholder="Emma"
                        value={child.name}
                        onChange={(e) => updateChild(i, "name", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Age</Label>
                      <Input
                        type="number"
                        min={3}
                        max={18}
                        value={child.age}
                        onChange={(e) => updateChild(i, "age", parseInt(e.target.value) || 8)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Safety level: {strictnessLabel(child.strictness)} ({child.strictness}/5)
                    </Label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={child.strictness}
                      onChange={(e) => updateChild(i, "strictness", parseInt(e.target.value))}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-muted-foreground">
                      Preset: {presets.find((p) => p.id === child.preset_id)?.name || child.preset_id}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button variant="outline" onClick={addChild} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add another child
            </Button>

            <Button onClick={handleChildrenSubmit} disabled={loading} className="w-full">
              Continue
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
          <Card>
            <CardHeader>
              <CardTitle>You&apos;re all set!</CardTitle>
              <CardDescription>
                Homeward is ready. Your kids can start chatting safely, and you can review conversations from your dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  {children.length} child profile{children.length !== 1 ? "s" : ""} created
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  Local AI via Ollama {ollamaReady ? "(ready)" : "(checking…)"}
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  All conversations logged for your review
                </li>
              </ul>
              <Button onClick={handleComplete} disabled={loading || !ollamaReady} className="w-full" size="lg">
                Go to Dashboard
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
