"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { chatPathForChild } from "@/lib/slug";
import { getAgeTheme, AGE_THEME_CONFIGS } from "@/lib/age-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ExternalLink,
  Users,
  Shield,
  BookOpen,
  Lock,
  Moon,
  Sparkles,
  Check,
  Edit2,
  X,
} from "lucide-react";

export default function ProfilesPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [childDraft, setChildDraft] = useState<
    Partial<Child & { pin: string; clear_pin: boolean }>
  >({});
  const [childSaveError, setChildSaveError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .children()
      .then(setChildren)
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

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading profiles…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6 animate-fade-in">
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Child Profiles & Safety Levels
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure safety presets, PIN locks, homework mode, and quiet hours for each child.
        </p>
      </div>

      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Configured Children
          </CardTitle>
          <CardDescription>
            Each child gets a personalized experience and dedicated chat link (e.g. /chat/lincoln).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {children.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No child profiles found.
              </p>
              <Link href="/setup">
                <Button className="rounded-xl">Complete Setup</Button>
              </Link>
            </div>
          ) : (
            children.map((child) => {
              const themeKey = getAgeTheme(child);
              const theme = AGE_THEME_CONFIGS[themeKey];
              const isEditing = editingChildId === child.id;

              return (
                <div
                  key={child.id}
                  className={`rounded-2xl border transition-all p-5 space-y-4 ${
                    isEditing
                      ? "border-primary/50 bg-primary/5 shadow-sm"
                      : "border-border/80 bg-card hover:border-primary/40 shadow-xs"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-xs ${theme.avatarBg}`}
                      >
                        {theme.avatarEmoji}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-foreground text-lg">
                            {child.name}
                          </h3>
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                            {theme.title}
                          </span>
                          {child.has_pin && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                              <Lock className="h-3 w-3" /> PIN set
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Age {child.age} · Safety strictness {child.strictness ?? 3}/5
                          {child.homework_mode && " · 📚 Homework Mode"}
                          {child.quiet_hours_enabled && " · 🌙 Quiet Hours"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={chatPathForChild(child)}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Chat
                        </Button>
                      </Link>
                      {!isEditing ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditChild(child)}
                          className="rounded-xl text-xs font-medium"
                        >
                          <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingChildId(null)}
                          className="rounded-xl text-xs text-muted-foreground"
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Edit Form Drawer */}
                  {isEditing && (
                    <div className="space-y-4 border-t border-border/70 pt-4 animate-slide-down">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Name
                          </label>
                          <Input
                            value={childDraft.name || ""}
                            onChange={(e) =>
                              setChildDraft({ ...childDraft, name: e.target.value })
                            }
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Age
                          </label>
                          <Input
                            type="number"
                            min={3}
                            max={18}
                            value={childDraft.age ?? 8}
                            onChange={(e) =>
                              setChildDraft({
                                ...childDraft,
                                age: parseInt(e.target.value, 10) || 8,
                              })
                            }
                            className="rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                            Safety Strictness
                          </span>
                          <span className="font-bold text-primary">
                            Level {childDraft.strictness ?? 3} of 5
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={childDraft.strictness ?? 3}
                          onChange={(e) =>
                            setChildDraft({
                              ...childDraft,
                              strictness: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Secret Profile PIN (optional)
                        </label>
                        <Input
                          type="password"
                          placeholder={
                            child.has_pin ? "Enter new PIN to replace" : "4–6 digits (optional)"
                          }
                          value={childDraft.pin || ""}
                          onChange={(e) =>
                            setChildDraft({
                              ...childDraft,
                              pin: e.target.value,
                              clear_pin: false,
                            })
                          }
                          maxLength={6}
                          className="rounded-xl font-mono"
                        />
                        {child.has_pin && (
                          <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={childDraft.clear_pin || false}
                              onChange={(e) =>
                                setChildDraft({
                                  ...childDraft,
                                  clear_pin: e.target.checked,
                                  pin: "",
                                })
                              }
                              className="accent-primary rounded"
                            />
                            <span>Remove existing PIN</span>
                          </label>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 pt-1">
                        <label className="flex items-center gap-2.5 rounded-xl border border-border/80 p-3 text-sm cursor-pointer hover:bg-background/80 transition-colors">
                          <input
                            type="checkbox"
                            checked={childDraft.homework_mode || false}
                            onChange={(e) =>
                              setChildDraft({
                                ...childDraft,
                                homework_mode: e.target.checked,
                              })
                            }
                            className="accent-primary rounded h-4 w-4"
                          />
                          <div>
                            <p className="font-semibold text-foreground flex items-center gap-1.5">
                              <BookOpen className="h-4 w-4 text-primary" />
                              Homework Mode
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Gives helpful hints instead of copy-paste answers
                            </p>
                          </div>
                        </label>

                        <label className="flex items-center gap-2.5 rounded-xl border border-border/80 p-3 text-sm cursor-pointer hover:bg-background/80 transition-colors">
                          <input
                            type="checkbox"
                            checked={childDraft.allow_resume !== false}
                            onChange={(e) =>
                              setChildDraft({
                                ...childDraft,
                                allow_resume: e.target.checked,
                              })
                            }
                            className="accent-primary rounded h-4 w-4"
                          />
                          <div>
                            <p className="font-semibold text-foreground flex items-center gap-1.5">
                              <Sparkles className="h-4 w-4 text-primary" />
                              Allow Session Resume
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Can continue previous chats across visits
                            </p>
                          </div>
                        </label>
                      </div>

                      {/* Quiet Hours */}
                      <div className="rounded-xl border border-border/80 p-3.5 space-y-3">
                        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={childDraft.quiet_hours_enabled || false}
                            onChange={(e) =>
                              setChildDraft({
                                ...childDraft,
                                quiet_hours_enabled: e.target.checked,
                              })
                            }
                            className="accent-primary rounded h-4 w-4"
                          />
                          <span className="flex items-center gap-1.5">
                            <Moon className="h-4 w-4 text-indigo-500" />
                            Enable Quiet Hours
                          </span>
                        </label>

                        {childDraft.quiet_hours_enabled && (
                          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50 text-xs">
                            <div className="space-y-1">
                              <label className="font-medium text-muted-foreground">
                                Quiet time starts
                              </label>
                              <Input
                                type="time"
                                value={childDraft.quiet_hours_start || "20:00"}
                                onChange={(e) =>
                                  setChildDraft({
                                    ...childDraft,
                                    quiet_hours_start: e.target.value,
                                  })
                                }
                                className="rounded-xl h-9 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="font-medium text-muted-foreground">
                                Quiet time ends
                              </label>
                              <Input
                                type="time"
                                value={childDraft.quiet_hours_end || "07:00"}
                                onChange={(e) =>
                                  setChildDraft({
                                    ...childDraft,
                                    quiet_hours_end: e.target.value,
                                  })
                                }
                                className="rounded-xl h-9 text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {childSaveError && (
                        <p className="text-xs font-semibold text-destructive">
                          {childSaveError}
                        </p>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingChildId(null)}
                          className="rounded-xl"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveChildSettings}
                          className="rounded-xl font-semibold shadow-xs"
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </main>
  );
}
