"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ParentLockOverlay } from "@/components/parent-lock-overlay";
import { useParentLock } from "@/hooks/use-parent-lock";
import {
  homeworkCameraCaptureAllowed,
  homeworkCameraClickAction,
  mapHomeworkParentError,
} from "@/lib/homework-camera-gate";

/** Parent-gated worksheet camera. Vision model expected by the gateway: llava:7b */
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export interface HomeworkCameraProps {
  childId: number;
  enabled: boolean;
  disabled?: boolean;
  simpleMode?: boolean;
  /** Optional: send the hint into chat. The panel also shows it inline. */
  onHint?: (hint: string) => void;
}

export function HomeworkCamera({
  childId,
  enabled,
  disabled,
  simpleMode,
  onHint,
}: HomeworkCameraProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const { locked, refreshActivity } = useParentLock();
  const parentUnlocked = !locked;
  const [open, setOpen] = useState(false);
  const panelOpen = open && parentUnlocked;
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visionNote, setVisionNote] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !open || !parentUnlocked) return;
    api
      .homeworkStatus(childId)
      .then((status) => {
        setVisionNote(status.available ? null : status.message);
      })
      .catch(() => setVisionNote(null));
  }, [childId, enabled, open, parentUnlocked]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setFile(null);
  }, []);

  const pickFile = (next: File | null) => {
    clearPreview();
    setHint(null);
    setError(null);
    if (!next) return;
    const url = URL.createObjectURL(next);
    previewUrlRef.current = url;
    setFile(next);
    setPreviewUrl(url);
  };

  const requestParentUnlock = useCallback(() => {
    setChallengeOpen(true);
  }, []);

  const handleCameraClick = () => {
    const action = homeworkCameraClickAction(panelOpen, parentUnlocked);
    if (action === "close") {
      setOpen(false);
      return;
    }
    if (action === "open") {
      setOpen(true);
      return;
    }
    requestParentUnlock();
  };

  const handleParentUnlocked = () => {
    refreshActivity();
    setChallengeOpen(false);
    setOpen(true);
  };

  const ensureCaptureUnlocked = () => {
    if (homeworkCameraCaptureAllowed(parentUnlocked)) return true;
    requestParentUnlock();
    return false;
  };

  const handleSubmit = async () => {
    if (!file || busy) return;
    if (!ensureCaptureUnlocked()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.homeworkHint(childId, file, question);
      setHint(result.hint);
      if (!result.vision_available) {
        setVisionNote(result.hint);
      }
      onHint?.(result.hint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a hint from that photo.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant={panelOpen ? "default" : "outline"}
        size="icon"
        disabled={disabled}
        title="Homework camera — snap a worksheet for a hint"
        aria-label="Homework camera"
        aria-pressed={panelOpen}
        onClick={handleCameraClick}
        className={`rounded-2xl border-border/80 ${simpleMode ? "h-14 w-14" : "h-11 w-11"}`}
      >
        <Camera className={`h-5 w-5 ${panelOpen ? "" : "text-amber-600 dark:text-amber-400"}`} />
      </Button>

      {panelOpen && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-amber-500/30 bg-card/95 p-3 shadow-lg backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className={`font-semibold text-amber-700 dark:text-amber-300 ${simpleMode ? "text-base" : "text-sm"}`}>
              Worksheet camera
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close homework camera"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Snap or upload a worksheet. I&apos;ll give a hint — not the final answer.
            Photos are not saved.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            capture="environment"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => {
                if (!ensureCaptureUnlocked()) return;
                inputRef.current?.click();
              }}
              className="rounded-xl"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Snap or upload
            </Button>
            {file && (
              <Button
                type="button"
                size="sm"
                disabled={disabled || busy}
                onClick={() => void handleSubmit()}
                className="rounded-xl"
              >
                {busy ? "Looking…" : "Get a hint"}
              </Button>
            )}
          </div>

          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- ephemeral object URL, not a remote asset
            <img
              src={previewUrl}
              alt="Worksheet preview"
              className="mt-2 max-h-36 rounded-xl border border-border/70 object-contain"
            />
          )}

          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What are you stuck on? (optional)"
            disabled={disabled || busy}
            className="mt-2 w-full rounded-xl border border-border/80 bg-background/90 px-3 py-2 text-sm"
          />

          {visionNote && !hint && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{visionNote}</p>
          )}
          {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
          {hint && (
            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              {hint}
            </div>
          )}
        </div>
      )}

      {challengeOpen && (
        <ParentLockOverlay
          title="Ask a parent"
          description="A parent needs to unlock the worksheet camera. Photos are not saved."
          submitLabel="Unlock camera"
          onUnlock={handleParentUnlocked}
          onCancel={() => setChallengeOpen(false)}
          mapError={mapHomeworkParentError}
        />
      )}
    </div>
  );
}
