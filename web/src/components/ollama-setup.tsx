"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type OllamaRecommendation, type OllamaStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Cpu, Download, RefreshCw, Server } from "lucide-react";

interface OllamaSetupProps {
  onReadyChange?: (ready: boolean) => void;
  showContinue?: boolean;
  onContinue?: () => void;
  continueLabel?: string;
  loading?: boolean;
}

export function OllamaSetup({
  onReadyChange,
  showContinue = false,
  onContinue,
  continueLabel = "Continue",
  loading = false,
}: OllamaSetupProps) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [recommendations, setRecommendations] = useState<OllamaRecommendation | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [initializedSelection, setInitializedSelection] = useState(false);
  const [pullJobId, setPullJobId] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullMessage, setPullMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bootstrapAttempted = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.ollamaStatus(), api.ollamaRecommendations()]);
      setStatus(s);
      setRecommendations(r);
      if (!initializedSelection) {
        const allModels = [...r.models, ...(r.other_installed ?? [])];
        const preselected =
          allModels.find((m) => m.selected_chat)?.id ||
          allModels.find((m) => m.recommended && m.fits_machine)?.id ||
          r.recommended_model;
        setSelectedModel(preselected);
        setInitializedSelection(true);
      }
      onReadyChange?.(s.ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AI status");
    }
  }, [initializedSelection, onReadyChange]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!pullJobId) return;
    const interval = setInterval(async () => {
      try {
        const job = await api.ollamaPullStatus(pullJobId);
        setPullProgress(job.progress);
        setPullMessage(job.message);
        if (job.status === "complete") {
          setPullJobId(null);
          setBusy(false);
          await refresh();
        } else if (job.status === "error") {
          setPullJobId(null);
          setBusy(false);
          setError(job.error || "Download failed");
        }
      } catch {
        setPullJobId(null);
        setBusy(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pullJobId, refresh]);

  const startDownload = async (model?: string) => {
    const target = model || selectedModel;
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.ollamaPull(target);
      setPullJobId(result.job_id);
      setPullProgress(0);
      setPullMessage("Starting download…");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  useEffect(() => {
    if (bootstrapAttempted.current || !status || !recommendations) return;
    if (status.ready || pullJobId || busy) return;

    bootstrapAttempted.current = true;
    api.ollamaBootstrap()
      .then(async (result) => {
        if (result.ready) {
          await refresh();
          return;
        }
        if (result.job_id) {
          if (result.model) setSelectedModel(result.model);
          setPullJobId(result.job_id);
          setBusy(true);
          setPullProgress(0);
          setPullMessage("Downloading recommended model…");
        }
      })
      .catch(() => {
        bootstrapAttempted.current = false;
      });
  }, [status, recommendations, pullJobId, busy, refresh]);

  const handleSave = async () => {
    if (!selectedModel) return;
    setBusy(true);
    setError("");
    try {
      await api.ollamaSettings(selectedModel);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save model");
    } finally {
      setBusy(false);
    }
  };

  const catalogModels = recommendations?.models ?? [];
  const otherModels = recommendations?.other_installed ?? [];
  const allModels = [...catalogModels, ...otherModels];
  const selected = allModels.find((m) => m.id === selectedModel);
  const managed = status?.managed;
  const canDownload =
    status?.reachable && selected && !selected.installed && selected.fits_machine && !selected.from_ollama;
  const isInstalled = selected?.installed || status?.installed_models?.includes(selectedModel);
  const isReady = status?.reachable && !!selectedModel && isInstalled;

  const statusTitle = !status
    ? "Checking AI status…"
    : status.reachable
      ? managed
        ? "AI engine is running"
        : "Ollama is running"
      : managed
        ? "AI engine is starting…"
        : "AI is not running yet";

  const statusDetail = !status
    ? "One moment while Homeward checks your setup."
    : status.reachable
      ? managed
        ? "Homeward includes Ollama — no separate install needed."
        : `Connected to ${status.ollama_url}`
      : managed
        ? status.bootstrap_hint || "First launch can take a few minutes while everything starts."
        : "Install Ollama from ollama.com, then run: ollama serve";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Local AI
          </CardTitle>
          <CardDescription>
            Homeward runs AI on your computer. Nothing goes to the cloud unless you turn that on later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  status?.reachable ? "bg-green-500" : status ? "bg-amber-500 animate-pulse" : "bg-muted"
                }`}
              />
              <div>
                <p className="font-medium">{statusTitle}</p>
                <p className="text-xs text-muted-foreground">{statusDetail}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {recommendations && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 shrink-0" />
                Detected {recommendations.system_ram_gb} GB RAM on this computer
              </div>
              {recommendations.ram_detection === "fallback-default" ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Could not read your system memory — showing conservative defaults.
                </p>
              ) : (
                <p className="text-xs">
                  Checked via Ollama on this machine
                  {status?.installed_models?.length
                    ? ` · ${status.installed_models.length} model${status.installed_models.length !== 1 ? "s" : ""} already installed`
                    : ""}
                </p>
              )}
            </div>
          )}

          {!status?.reachable && !managed && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Install Ollama to continue</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>
                  Download from{" "}
                  <a href="https://ollama.com" className="underline" target="_blank" rel="noreferrer">
                    ollama.com
                  </a>
                </li>
                <li>Run: <code className="rounded bg-muted px-1">ollama serve</code></li>
                <li>Come back here — Homeward will detect it automatically</li>
              </ol>
            </div>
          )}

          {!status?.reachable && managed && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              Homeward is starting Ollama in the background. This page will update automatically —
              no terminal commands needed.
            </div>
          )}
        </CardContent>
      </Card>

      {recommendations && status?.reachable && (
        <Card>
          <CardHeader>
            <CardTitle>Choose an AI model</CardTitle>
            <CardDescription>
              Models are filtered by your {recommendations.system_ram_gb} GB RAM. Download curated picks, or use
              something you already pulled with Ollama.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {catalogModels.map((model) => (
              <label
                key={model.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  !model.fits_machine ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"
                } ${selectedModel === model.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="ollama-model"
                  value={model.id}
                  checked={selectedModel === model.id}
                  disabled={!model.fits_machine}
                  onChange={() => setSelectedModel(model.id)}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{model.name}</span>
                    {model.recommended && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Recommended
                      </span>
                    )}
                    {model.installed && (
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                        Ready
                      </span>
                    )}
                    {!model.fits_machine && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Needs {model.min_ram_gb} GB RAM
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{model.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ~{model.size_gb} GB download · needs {model.min_ram_gb} GB RAM
                  </p>
                </div>
              </label>
            ))}

            {otherModels.length > 0 && (
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium">Already installed in Ollama</p>
                {otherModels.map((model) => (
                  <label
                    key={model.id}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                      selectedModel === model.id ? "border-primary bg-primary/5" : "border-border"
                    } ${!model.fits_machine ? "opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="ollama-model"
                      value={model.id}
                      checked={selectedModel === model.id}
                      disabled={!model.fits_machine}
                      onChange={() => setSelectedModel(model.id)}
                      className="mt-1 accent-primary"
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{model.name}</span>
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                          Installed
                        </span>
                        {!model.fits_machine && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            May need {model.min_ram_gb}+ GB RAM
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{model.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {pullJobId && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Downloading {selectedModel}…</span>
                  <span>{pullProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(pullProgress, 5)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{pullMessage}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {canDownload && (
                <Button onClick={() => startDownload()} disabled={busy || !!pullJobId}>
                  <Download className="mr-2 h-4 w-4" />
                  Download model
                </Button>
              )}
              {selected?.installed && (
                <Button variant="outline" onClick={handleSave} disabled={busy || !!pullJobId}>
                  Use this model
                </Button>
              )}
            </div>

            {isReady && (
              <p className="text-sm text-green-700 dark:text-green-400">
                AI is ready — {selectedModel} is selected.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showContinue && onContinue && (
        <Button
          onClick={async () => {
            if (selected?.installed && selectedModel) {
              setBusy(true);
              try {
                await api.ollamaSettings(selectedModel);
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to save model");
                setBusy(false);
                return;
              }
              setBusy(false);
            }
            onContinue();
          }}
          disabled={loading || busy || !!pullJobId || !isReady}
          className="w-full"
          size="lg"
        >
          {continueLabel}
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
