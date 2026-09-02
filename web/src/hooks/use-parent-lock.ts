"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  clearParentUnlock,
  isParentLockExpired,
  markParentUnlocked,
  subscribeParentLock,
} from "@/lib/parent-lock";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export function useParentLock() {
  const [locked, setLocked] = useState(() =>
    typeof window !== "undefined" ? isParentLockExpired() : true,
  );

  const wasLockedRef = useRef<boolean | null>(null);

  const syncFromStorage = useCallback(() => {
    const expired = isParentLockExpired();
    setLocked(expired);
    // Idle lock is real, not cosmetic: drop the server session so the cookie
    // cannot be reused until the parent signs in again.
    if (expired && wasLockedRef.current === false) {
      void api.logout().catch(() => {});
    }
    wasLockedRef.current = expired;
  }, []);

  const refreshActivity = useCallback(() => {
    markParentUnlocked();
  }, []);

  const lockNow = useCallback(() => {
    clearParentUnlock();
  }, []);

  useEffect(() => {
    syncFromStorage();
    return subscribeParentLock(syncFromStorage);
  }, [syncFromStorage]);

  useEffect(() => {
    const onActivity = () => {
      if (isParentLockExpired()) return;
      markParentUnlocked();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const interval = window.setInterval(syncFromStorage, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") syncFromStorage();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncFromStorage]);

  return { locked, refreshActivity, lockNow };
}
