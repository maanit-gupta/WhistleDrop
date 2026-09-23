import type { ReportStatus } from "@prisma/client";

// Report status rules, shared by the API (lib/validation.ts and the status
// route) and the browser UI, so both always agree on what a moderator may do.
//
// Browser-safe: no runtime imports. The Prisma import above is type-only and
// is erased at build time.

/** The only permitted status transitions. Anything else is rejected. */
export const ALLOWED_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["RESOLVED", "DISMISSED"],
  RESOLVED: ["CLOSED"],
  DISMISSED: ["CLOSED"],
  CLOSED: [],
};

/** Every status, in workflow order. */
export const REPORT_STATUSES = Object.keys(ALLOWED_TRANSITIONS) as ReportStatus[];

export function isValidTransition(from: ReportStatus, to: ReportStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Statuses a report in `from` may move to next (empty for CLOSED). */
export function nextStatuses(from: ReportStatus): readonly ReportStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/** CLOSED is terminal and read-only: the API answers 423 REPORT_CLOSED to any change. */
export function isTerminal(status: ReportStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
