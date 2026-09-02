/** Remember which child profile this device uses for kid chat. */

const STORAGE_KEY = "homeward-device-profile-id";

export function getDeviceProfileId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function setDeviceProfileId(childId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(childId));
}

export function clearDeviceProfileId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function findChildById<T extends { id: number }>(
  children: T[],
  childId: number | null,
): T | undefined {
  if (childId == null) return undefined;
  return children.find((child) => child.id === childId);
}
