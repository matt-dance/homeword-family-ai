"use client";

import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.ollamaStatus(), api.ollamaRecommendations()]);
      setStatus(s);
      setRecommendations(r);
      if (!initializedSelection) {
        const preselected =
          r.models.find((m) => m.selected_chat)?.id ||
          r.models.find((m) => m.recommended && m.fits_machine)?.id ||
          r.recommended_model;
        setSelectedModel(preselected);
        setInitializedSelection(true);
      }
      onReadyChange?.(s.ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Ollama status");
    }
  }, [initializedSelection, onReadyChange]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
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
          setError(job.error || "Model download failed");
        }
      } catch {
        setPullJobId(null);
        setBusy(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pullJobId, refresh]);

  const handleInstall = async () => {
    if (!selectedModel) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.ollamaPull(selectedModel);
      setPullJobId(result.job_id);
      setPullProgress(0);
      setPullMessage("Starting download…");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Install failed");
    }
  };

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

  const selected = recommendations?.models.find((m) => m.id === selectedModel);
  const canInstall = status?.reachable && selected && !selected.installed && selected.fits_machine;
  const isReady = status?.ready && selected?.installed;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Local AI (Ollama)
          </CardTitle>
          <CardDescription>
            Homeward runs AI on your computer — nothing is sent to the cloud unless you enable it later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${status?.reachable ? "bg-green-500" : "bg-destructive"}`}
              />
              <div>
                <p className="font-medium">
                  {status?.reachable ? "Ollama is running" : "Ollama is not running"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status?.reachable
                    ? `Connected to ${status.ollama_url}`
                    : "Install from ollama.com, then run: ollama serve"}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {recommendations && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Cpu className="h-4 w-4" />
              Detected {recommendations.system_ram_gb} GB RAM on this machine
            </div>
          )}

          {!status?.reachable && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">Start Ollama first</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>
                  Download Ollama from{" "}
                  <a href="https://ollama.com" className="underline" target="_blank" rel="noreferrer">
                    ollama.com
                  </a>
                </li>
                <li>Open a terminal and run: <code className="rounded bg-muted px-1">ollama serve</code></li>
                <li>Come back here and click Refresh</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {recommendations && status?.reachable && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a model</CardTitle>
            <CardDescription>
              Pick a model that fits your computer. Larger models give better answers but need more memory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.models.map((model) => (
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
                        Installed
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
                    ~{model.size_gb} GB download · {model.min_ram_gb} GB RAM minimum
                  </p>
                </div>
              </label>
            ))}

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
              {canInstall && (
                <Button onClick={handleInstall} disabled={busy || !!pullJobId}>
                  <Download className="mr-2 h-4 w-4" />
                  Install model
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
                AI is ready — {status.chat_model} is installed and selected.
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
