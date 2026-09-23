import "@/lib/zodOpenApi"; // must run before any schema below is created
import { z } from "zod";
import { ModeratorRole, NoteVisibility, ReportCategory, ReportStatus } from "@prisma/client";

/** Evidence uploads: the only accepted types, the per-file size cap, and files per report. */
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type UploadMimeType = (typeof ALLOWED_UPLOAD_TYPES)[number];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;

export const reportSubmissionSchema = z
  .object({
    category: z.enum(ReportCategory),
    description: z.string().trim().min(20).max(5000),
    evidenceUrl: z
      .url({ protocol: /^https?$/ })
      .max(2048)
      .optional(),
    /** Upload tokens from POST /api/uploads/sign, one per file already uploaded to storage. */
    attachments: z
      .array(z.string().min(1).max(4096))
      .max(MAX_ATTACHMENTS)
      .refine((tokens) => new Set(tokens).size === tokens.length, "Each upload token may only be used once")
      .optional(),
  })
  .strict();

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;

export const uploadSignRequestSchema = z
  .object({
    mimeType: z.enum(ALLOWED_UPLOAD_TYPES),
    sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  })
  .strict();

export type UploadSignRequest = z.infer<typeof uploadSignRequestSchema>;

/** The only permitted status transitions. Anything else is rejected. */
export const ALLOWED_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["RESOLVED", "DISMISSED"],
  RESOLVED: ["CLOSED"],
  DISMISSED: ["CLOSED"],
  CLOSED: [],
};

export function isValidTransition(from: ReportStatus, to: ReportStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Request body shape; the transition is checked against the report's current status. */
export const statusUpdateRequestSchema = z
  .object({
    newStatus: z.enum(ReportStatus),
    note: z.string().trim().max(2000).optional(),
    /** PUBLIC notes are shown to the reporter; INTERNAL ones only to moderators. Defaults to PUBLIC. */
    visibility: z.enum(NoteVisibility).optional(),
  })
  .strict();

export type StatusUpdateRequest = z.infer<typeof statusUpdateRequestSchema>;

/**
 * Validates the body and enforces the transition from `currentStatus`.
 * Call with the report's status loaded from the DB, never a client-supplied value.
 */
export function statusUpdateSchemaFor(currentStatus: ReportStatus) {
  return statusUpdateRequestSchema.refine((data) => isValidTransition(currentStatus, data.newStatus), {
    path: ["newStatus"],
    message: `Invalid status transition from ${currentStatus}`,
  });
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const moderatorLoginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(256),
  })
  .strict();

export type ModeratorLogin = z.infer<typeof moderatorLoginSchema>;

/** Ids are Prisma cuids; anything else can't exist, so skip the DB lookup. */
export const idSchema = z.cuid();
export const reportIdSchema = idSchema;

/** "A,B" -> ["A", "B"], each validated against the enum. */
const csvOf = <T extends Record<string, string>>(values: T) =>
  z
    .string()
    .transform((s) =>
      s
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));

/** ISO date (YYYY-MM-DD, whole UTC day) or full ISO datetime with offset. */
const dateBound = (edge: "start" | "end") =>
  z.union([z.iso.datetime({ offset: true }), z.iso.date()]).transform((v) =>
    v.length === 10 ? new Date(`${v}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`) : new Date(v),
  );

export const REPORT_SORT_FIELDS = ["createdAt", "updatedAt", "status"] as const;

/** Query params for GET /api/mod/reports. Unknown params are rejected so typos don't silently return everything. */
export const modReportsQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    status: csvOf(ReportStatus).optional(),
    category: csvOf(ReportCategory).optional(),
    from: dateBound("start").optional(),
    to: dateBound("end").optional(),
    sort: z.enum(REPORT_SORT_FIELDS).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["from"], message: "from must be on or before to" });

export type ModReportsQuery = z.infer<typeof modReportsQuerySchema>;

/** bcrypt only uses the first 72 bytes of a password; longer ones would be silently truncated. */
const newPasswordSchema = z
  .string()
  .min(12)
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Password must be at most 72 bytes");

export const createModeratorSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    role: z.enum(ModeratorRole).default("MODERATOR"),
  })
  .strict();

export type CreateModerator = z.infer<typeof createModeratorSchema>;

export const updateModeratorSchema = z
  .object({
    role: z.enum(ModeratorRole).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.role !== undefined || d.isActive !== undefined, "Provide role and/or isActive");

export type UpdateModerator = z.infer<typeof updateModeratorSchema>;
