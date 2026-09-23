// Case code input handling for the reporter pages. Browser-safe.
//
// PRIVACY: never log, store or put a case code in a URL. These helpers only
// transform strings held in React state.

/** Same format the server checks (lib/caseCode.ts): WD-XXXX-XXXX, A–Z 0–9. */
export const CASE_CODE_PATTERN = /^WD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Accepts what people actually type: any case, spaces, missing dashes, and
 * with or without the "WD" prefix. Returns the canonical code, or null when
 * the input can't be one (it is checked locally, so no lookup is spent on it).
 */
export function normalizeCaseCode(input: string): string | null {
  const chars = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = chars.length === 10 && chars.startsWith("WD") ? chars.slice(2) : chars.length === 8 ? chars : null;
  if (!body) return null;
  const code = `WD-${body.slice(0, 4)}-${body.slice(4)}`;
  return CASE_CODE_PATTERN.test(code) ? code : null;
}
