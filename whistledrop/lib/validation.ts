/**
 * Request validation schemas and business rules, shared by the route handlers
 * and the generated OpenAPI document (lib/openapi.ts).
 *
 * SERVER-ONLY. This module extends Zod with zod-to-openapi and carries server
 * rules, so it must never be part of a browser bundle:
 * - Client/frontend code may only use `import type { … } from "@/lib/validation"`
 *   (types come from `z.infer`, and type-only imports are erased at build time).
 * - If a client component needs runtime validation, create
 *   `lib/validation.client.ts` that exports plain Zod schemas without the
 *   OpenAPI extension; don't import this file at runtime from the client.
 * `import "server-only"` below enforces this: a runtime import from client code
 * fails the build.
 */
import "server-only";
import "@/lib/zodOpenApi"; // must run before any schema below is created
import { z } from "zod";
import { ModeratorRole, NoteVisibility, ReportCategory, ReportStatus } from "@prisma/client";
import { isValidTransition } from "@/lib/transitions.shared";

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

// Status transition rules live in lib/transitions.shared.ts so the browser UI
// can import the same rules; re-exported here for existing server imports.
export { ALLOWED_TRANSITIONS, isValidTransition } from "@/lib/transitions.shared";

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

/** One conversation message or internal note: trimmed, 1–2000 characters, line breaks kept. */
export const MESSAGE_MAX_CHARS = 2000;
const messageBody = z.string().trim().min(1).max(MESSAGE_MAX_CHARS);

/**
 * A case code sent in a request body (never the URL path, so it stays out of
 * hosting request logs). Only the type and a sanity length are checked here:
 * a string that isn't a valid code gets the same 404 as an unknown one.
 */
const caseCodeField = z.string().max(64);

/** POST /api/reports/lookup */
export const caseLookupSchema = z.object({ caseCode: caseCodeField }).strict();

/** POST /api/reports/messages: the reporter's side of the conversation. */
export const reporterMessageSchema = z.object({ caseCode: caseCodeField, body: messageBody }).strict();

/** POST /api/mod/reports/{id}/messages: a reply the reporter will see. */
export const moderatorMessageSchema = z.object({ body: messageBody }).strict();

/** POST /api/mod/reports/{id}/notes: always INTERNAL; there is no visibility option. */
export const internalNoteSchema = z.object({ body: messageBody }).strict();

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
    /** "true": only cases whose latest message is the reporter's; "false": the rest. */
    awaitingReply: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
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
