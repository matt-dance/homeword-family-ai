"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { markParentUnlocked } from "@/lib/parent-lock";
import { useParentLock } from "@/hooks/use-parent-lock";
import { ParentNav } from "@/components/parent-nav";
import { ParentLockOverlay } from "@/components/parent-lock-overlay";
import {
  applyAuthMeResult,
  isParentSignedOut,
  leaveParentDashboard,
  parentDashboardShouldRender,
  signOutParentSession,
  type ParentAuthGate,
} from "@/lib/parent-session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<ParentAuthGate>("checking");
  const authEpochRef = useRef(0);
  const { locked, refreshActivity } = useParentLock();

  useEffect(() => {
    const epoch = authEpochRef.current;
    let cancelled = false;

    const reject = () => {
      if (cancelled || epoch !== authEpochRef.current) return;
      setAuth("unauthed");
      if (isParentSignedOut()) {
        leaveParentDashboard();
        return;
      }
      router.replace("/setup");
    };

    if (isParentSignedOut()) {
      reject();
      return () => {
        cancelled = true;
      };
    }

    api
      .me()
      .then(() => {
        const next = applyAuthMeResult({
          signedOut: isParentSignedOut(),
          meOk: true,
          cancelled: cancelled || epoch !== authEpochRef.current,
        });
        if (next !== "authed") {
          reject();
          return;
        }
        markParentUnlocked();
        setAuth("authed");
      })
      .catch(() => reject());

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = async () => {
    authEpochRef.current += 1;
    setAuth("unauthed");
    await signOutParentSession(() => api.logout(), leaveParentDashboard);
  };

  if (!parentDashboardShouldRender(auth)) {
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
