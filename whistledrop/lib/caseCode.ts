import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// 36 symbols; 256 % 36 != 0, so bytes >= 252 are rejected to avoid modulo bias.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
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

/** Format: WD-XXXX-XXXX (uppercase alphanumeric). */
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
