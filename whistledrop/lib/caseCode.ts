import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// A–Z and 2–9: 34 symbols. 0 and 1 are left out so a generated code can never
// equal a demo sample code (WD-DEMO-0001 … in lib/demo.ts, which always contain
// 0 or 1), and they are easily confused with O and I anyway. 256 % 34 != 0, so
// bytes >= 238 are rejected to avoid modulo bias. The accepted format
// (CASE_CODE_PATTERN) still allows 0–9, so older codes and demo codes stay valid.
export const CASE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
const ALPHABET = CASE_CODE_ALPHABET;
const REJECT_THRESHOLD = 256 - (256 % ALPHABET.length);
const MAX_ATTEMPTS = 5;

function randomChars(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= REJECT_THRESHOLD) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Format: WD-XXXX-XXXX, from CASE_CODE_ALPHABET (never 0 or 1). */
export function formatCaseCode(): string {
  return `WD-${randomChars(4)}-${randomChars(4)}`;
}

export const CASE_CODE_PATTERN = /^WD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Returns a case code not yet used by any report. The unique constraint on
 * Report.caseCode remains the final guard against a race between check and insert.
 */
export async function generateCaseCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = formatCaseCode();
    const existing = await prisma.report.findUnique({
      where: { caseCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Failed to generate a unique case code");
}

/**
 * Trims and upper-cases a code as a reporter might type it, or returns null if
 * it isn't in the WD-XXXX-XXXX format. Callers answer null exactly like an
 * unknown code, so malformed and unknown codes can't be told apart.
 */
export function normalizeCaseCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CASE_CODE_PATTERN.test(code) ? code : null;
}
