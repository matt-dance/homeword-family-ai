import { clearParentUnlock } from "@/lib/parent-lock";

/** Survives a hard navigation so /setup and /dashboard cannot auto-restore. */
export const PARENT_SIGNED_OUT_KEY = "homeward-parent-signed-out";

export type ParentAuthGate = "checking" | "authed" | "unauthed";
export type ParentRouteDecision = "/dashboard" | "/setup";

let signedOutMemory = false;

function storage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function markParentSignedOut(): void {
  signedOutMemory = true;
  storage()?.setItem(PARENT_SIGNED_OUT_KEY, "1");
  clearParentUnlock();
}

export function clearParentSignedOut(): void {
  signedOutMemory = false;
  storage()?.removeItem(PARENT_SIGNED_OUT_KEY);
}

export function isParentSignedOut(): boolean {
  return signedOutMemory || storage()?.getItem(PARENT_SIGNED_OUT_KEY) === "1";
}

export function parentDashboardShouldRender(auth: ParentAuthGate): boolean {
  return auth === "authed";
}

export function applyAuthMeResult(opts: {
  signedOut: boolean;
  meOk: boolean;
  cancelled?: boolean;
}): ParentAuthGate {
  if (opts.cancelled || opts.signedOut || !opts.meOk) return "unauthed";
  return "authed";
}

export function parentRouteAfterSessionCheck(input: {
  setupComplete: boolean;
  hasParent?: boolean;
  signedOut: boolean;
  meOk: boolean;
}): ParentRouteDecision {
  if (input.hasParent === false || !input.setupComplete) return "/setup";
  if (input.signedOut || !input.meOk) return "/setup";
  return "/dashboard";
}

/**
 * Drop client parent session first, then the cookie, then leave the SPA tree.
 * Callers should hard-navigate (`location.replace`) so Next cannot restore
 * the cached dashboard shell.
 */
export async function signOutParentSession(
  logout: () => Promise<unknown>,
  navigate: () => void,
): Promise<void> {
  markParentSignedOut();
  try {
    await logout();
  } catch {
    // Cookie may already be gone (idle lock also logs out). Still leave.
  }
  navigate();
}

export function leaveParentDashboard(): void {
  if (typeof window === "undefined") return;
  window.location.replace("/setup");
}
