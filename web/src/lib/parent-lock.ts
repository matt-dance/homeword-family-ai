export const PARENT_LOCK_IDLE_MS = 5 * 60 * 1000;
export const PARENT_UNLOCK_KEY = "homeward-parent-unlocked-at";

export function markParentUnlocked(): void {
  sessionStorage.setItem(PARENT_UNLOCK_KEY, String(Date.now()));
}

export function isParentLockExpired(now = Date.now()): boolean {
  const raw = sessionStorage.getItem(PARENT_UNLOCK_KEY);
  if (!raw) return true;
  const unlockedAt = Number.parseInt(raw, 10);
  if (Number.isNaN(unlockedAt)) return true;
  return now - unlockedAt >= PARENT_LOCK_IDLE_MS;
}

export function clearParentUnlock(): void {
  sessionStorage.removeItem(PARENT_UNLOCK_KEY);
}
