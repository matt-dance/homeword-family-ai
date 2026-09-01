"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { chatPathForChild } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Users } from "lucide-react";

export default function ProfilesPage() {
  const [children, setChildren] = useState<Child[]>([]);
  const [editingChildId, setEditingChildId] = useState<number | null>(null);
  const [childDraft, setChildDraft] = useState<Partial<Child & { pin: string; clear_pin: boolean }>>({});
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
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-muted-foreground">Loading profiles…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Child profiles</h1>
        <p className="text-muted-foreground">
          Names, safety levels, PINs, homework mode, and quiet hours for each child.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Your children
          </CardTitle>
          <CardDescription>
            Each child gets their own chat at a personal URL like /chat/lincoln.
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
                  <div className="flex gap-2">
                    <Link href={chatPathForChild(child)}>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Chat link
                      </Button>
                    </Link>
                    {editingChildId !== child.id && (
                      <Button size="sm" variant="outline" onClick={() => startEditChild(child)}>
                        Edit
                      </Button>
                    )}
                  </div>
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
    </main>
  );
}
