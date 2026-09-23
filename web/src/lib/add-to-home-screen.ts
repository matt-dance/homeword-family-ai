const STORAGE_KEY = "homeward-add-to-home-screen";
const JOIN_PROMPT_KEY = "homeward-add-to-home-screen-after-join";

export function hasDismissedAddToHomeScreen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissAddToHomeScreen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
  clearPromptAddToHomeScreenAfterJoin();
}

export function markPromptAddToHomeScreenAfterJoin(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JOIN_PROMPT_KEY, "1");
  } catch {
    // ignore
  }
}

export function shouldPromptAddToHomeScreenAfterJoin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(JOIN_PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPromptAddToHomeScreenAfterJoin(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(JOIN_PROMPT_KEY);
  } catch {
    // ignore
  }
}
