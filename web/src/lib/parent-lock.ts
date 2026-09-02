export const PARENT_LOCK_IDLE_MS = 5 * 60 * 1000;
export const PARENT_UNLOCK_KEY = "homeward-parent-unlocked-at";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeParentLock(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function storage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function markParentUnlocked(): void {
  storage()?.setItem(PARENT_UNLOCK_KEY, String(Date.now()));
  notify();
}

export function isParentLockExpired(now = Date.now()): boolean {
  const raw = storage()?.getItem(PARENT_UNLOCK_KEY);
  if (!raw) return true;
  const unlockedAt = Number.parseInt(raw, 10);
  if (Number.isNaN(unlockedAt)) return true;
  return now - unlockedAt >= PARENT_LOCK_IDLE_MS;
}

export function clearParentUnlock(): void {
  storage()?.removeItem(PARENT_UNLOCK_KEY);
  notify();
}
