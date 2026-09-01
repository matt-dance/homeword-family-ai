"use client";

import { useCallback, useEffect, useState } from "react";
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

  const syncFromStorage = useCallback(() => {
    setLocked(isParentLockExpired());
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
