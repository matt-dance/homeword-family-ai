"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearParentUnlock, markParentUnlocked } from "@/lib/parent-lock";
import { useParentLock } from "@/hooks/use-parent-lock";
import { ParentNav } from "@/components/parent-nav";
import { ParentLockOverlay } from "@/components/parent-lock-overlay";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const { locked, refreshActivity } = useParentLock();

  useEffect(() => {
    api
      .me()
      .then(() => {
        // A valid host session is enough to open this tab; idle lock still applies after.
        markParentUnlocked();
        setReady(true);
      })
      .catch(() => router.replace("/setup"));
  }, [router]);

  const handleLogout = async () => {
    clearParentUnlock();
    await api.logout();
    router.replace("/setup");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentNav onLogout={handleLogout} />
      {children}
      {locked && <ParentLockOverlay onUnlock={refreshActivity} />}
    </div>
  );
}
