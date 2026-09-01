"use client";

import { useCallback, useEffect, useState } from "react";
import { isParentLockExpired, markParentUnlocked } from "@/lib/parent-lock";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export function useParentLock() {
  const [locked, setLocked] = useState(() =>
    typeof window !== "undefined" ? isParentLockExpired() : true,
  );

  const refreshActivity = useCallback(() => {
    markParentUnlocked();
    setLocked(false);
  }, []);

  const lockNow = useCallback(() => {
    setLocked(true);
  }, []);

  useEffect(() => {
    setLocked(isParentLockExpired());

    const onActivity = () => {
      if (isParentLockExpired()) return;
      markParentUnlocked();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    const interval = window.setInterval(() => {
      if (isParentLockExpired()) setLocked(true);
    }, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && isParentLockExpired()) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { locked, refreshActivity, lockNow };
}
