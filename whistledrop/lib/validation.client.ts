import { z } from "zod";
import type { ReportCategory } from "@prisma/client";
import type { UploadMimeType } from "@/lib/validation";

// Browser copy of the report submission rules in lib/validation.ts, which is
// server-only (README, UI rule 6). Plain Zod, no OpenAPI extension.
// tests/client-validation.test.ts checks every value here against the server
// schema, so the two can't drift apart unnoticed.

export const REPORT_CATEGORIES = [
  "SECURITY",
  "HARASSMENT",
  "CORRUPTION",
  "TECHNICAL",
  "OTHER",
] as const satisfies readonly ReportCategory[];

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
export const EVIDENCE_URL_MAX = 2048;

export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const satisfies readonly UploadMimeType[];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;

/** The form's fields before upload tokens exist; same rules as reportSubmissionSchema. */
export const reportFormSchema = z.object({
  category: z.enum(REPORT_CATEGORIES, "Choose a category."),
  description: z
    .string()
    .trim()
    .min(DESCRIPTION_MIN, `Write at least ${DESCRIPTION_MIN} characters.`)
    .max(DESCRIPTION_MAX, `Keep it under ${DESCRIPTION_MAX.toLocaleString("en")} characters.`),
  evidenceUrl: z
    .url({ protocol: /^https?$/, error: "Enter a full link starting with http:// or https://." })
    .max(EVIDENCE_URL_MAX, `Links can be at most ${EVIDENCE_URL_MAX} characters.`)
    .optional(),
});

export type ReportFormValues = z.infer<typeof reportFormSchema>;
export type ReportFormField = keyof ReportFormValues;
