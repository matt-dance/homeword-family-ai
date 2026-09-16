/** 4-digit house join code. Never a kid profile PIN. */

export const HOUSE_CODE_LENGTH = 4;
export const HOUSE_CODE_PATTERN = /^\d{4}$/;

export function normalizeHouseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, HOUSE_CODE_LENGTH);
}

export function isCompleteHouseCode(code: string): boolean {
  return HOUSE_CODE_PATTERN.test(code);
}

/** Spoken as digits, e.g. "4 8 2 1". */
export function spokenHouseCode(code: string): string {
  return normalizeHouseCode(code).split("").join(" ");
}
