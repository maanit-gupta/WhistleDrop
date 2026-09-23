import type { ReportCategory, ReportStatus } from "@prisma/client";

// Display names for the API's enums. Browser-safe: type-only imports.

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  SECURITY: "Security",
  HARASSMENT: "Harassment",
  CORRUPTION: "Corruption",
  TECHNICAL: "Technical",
  OTHER: "Other",
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
  CLOSED: "Closed",
};

/** "in about 4 minutes" style wait, from a Retry-After value in seconds. */
export function formatWait(seconds: number | null): string {
  if (seconds === null) return "in a few minutes";
  if (seconds < 60) return `in ${Math.max(1, seconds)} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(iso));
