import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ModeratorRole, NoteVisibility, ReportCategory, ReportStatus } from "@prisma/client";
import {
  ALLOWED_UPLOAD_TYPES,
  caseLookupSchema,
  createModeratorSchema,
  idSchema,
  internalNoteSchema,
  modReportsQuerySchema,
  moderatorMessageSchema,
  moderatorLoginSchema,
  reportSubmissionSchema,
  reporterMessageSchema,
  statusUpdateRequestSchema,
  updateModeratorSchema,
  uploadSignRequestSchema,
} from "@/lib/validation";
import { RATE_LIMITS } from "@/lib/rateLimit";

// The OpenAPI document is generated from the same Zod schemas the routes use
// to validate requests (lib/validation.ts), so the docs can't drift from the
// validation. Response shapes had no schemas before; they're declared once here.
//
// The response schemas are exported so the browser client (lib/client/api.ts)
// can derive its types with `import type` + z.infer. Type-only imports are
// erased, so none of this module reaches a browser bundle.

const registry = new OpenAPIRegistry();

const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Token from POST /api/mod/login. Valid 12 hours; the account is re-checked on every request.",
});
const secured = [{ [bearerAuth.name]: [] }];

const cronAuth = registry.registerComponent("securitySchemes", "cronSecret", {
  type: "http",
  scheme: "bearer",
  description: "CRON_SECRET. Sent automatically by Vercel Cron; not a moderator token.",
});

// Request bodies: the existing validation schemas.
const ReportSubmission = registry.register("ReportSubmission", reportSubmissionSchema);
const UploadSignRequest = registry.register("UploadSignRequest", uploadSignRequestSchema);
const ModeratorLogin = registry.register("ModeratorLogin", moderatorLoginSchema);
const StatusUpdateRequest = registry.register("StatusUpdateRequest", statusUpdateRequestSchema);
const CreateModerator = registry.register("CreateModerator", createModeratorSchema);
const UpdateModerator = registry.register("UpdateModerator", updateModeratorSchema);
const CaseLookup = registry.register("CaseLookup", caseLookupSchema);
const ReporterMessage = registry.register("ReporterMessage", reporterMessageSchema);
const ModeratorMessage = registry.register("ModeratorMessage", moderatorMessageSchema);
const InternalNoteRequest = registry.register("InternalNoteRequest", internalNoteSchema);

// Response shapes.
export const ErrorResponse = registry.register(
  "Error",
  z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
);
export const PublicStatusUpdate = z.object({
  note: z.string().nullable(),
  newStatus: z.enum(ReportStatus),
  createdAt: z.iso.datetime(),
});
export const PublicConversationEntry = registry.register(
  "PublicConversationEntry",
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("message"),
      author: z.enum(["REPORTER", "REVIEW_TEAM"]).describe("Moderators appear only as REVIEW_TEAM."),
      body: z.string(),
      createdAt: z.iso.datetime(),
    }),
    z.object({
      type: z.literal("status"),
      status: z.enum(ReportStatus),
      note: z.string().optional().describe("Present only when the status change had a PUBLIC note."),
      createdAt: z.iso.datetime(),
    }),
  ]),
);
export const PublicConversation = z
  .array(PublicConversationEntry)
  .describe("Messages and every status change, oldest first. No ids, moderator details or INTERNAL notes.");
export const PublicReport = registry.register(
  "PublicReport",
  z.object({
    category: z.enum(ReportCategory),
    description: z.string(),
    evidenceUrl: z.string().nullable(),
    status: z.enum(ReportStatus),
    createdAt: z.iso.datetime(),
    statusUpdates: z.array(PublicStatusUpdate).describe("PUBLIC updates only; no ids or moderator details."),
    conversation: PublicConversation,
  }),
);
export const ReporterMessageCreated = z.object({ conversation: PublicConversation });
export const ModeratorStatusUpdate = z.object({
  id: z.string(),
  note: z.string().nullable(),
  visibility: z.enum(NoteVisibility),
  newStatus: z.enum(ReportStatus),
  createdAt: z.iso.datetime(),
  moderatorId: z.string().nullable(),
  moderator: z.object({ id: z.string(), email: z.string() }).nullable(),
});
const ModeratorRef = z.object({ id: z.string(), email: z.string() }).nullable();
export const ModeratorConversationEntry = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    id: z.string(),
    author: z.enum(["REPORTER", "REVIEW_TEAM"]),
    body: z.string(),
    createdAt: z.iso.datetime(),
    moderator: ModeratorRef.describe("The moderator who wrote a REVIEW_TEAM message; null for the reporter."),
  }),
  z.object({
    type: z.literal("status"),
    id: z.string(),
    status: z.enum(ReportStatus),
    note: z.string().optional().describe("The PUBLIC note, exactly as the reporter sees it."),
    visibility: z.enum(NoteVisibility),
    createdAt: z.iso.datetime(),
    moderator: ModeratorRef,
  }),
]);
export const InternalNoteEntry = z.object({
  type: z.enum(["note", "status"]).describe("An internal note, or an INTERNAL status update."),
  id: z.string(),
  status: z.enum(ReportStatus).optional().describe("For type status: the status the update moved the case to."),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  moderator: ModeratorRef,
});
export const AttachmentInfo = z.object({
  id: z.string(),
  mimeType: z.enum(ALLOWED_UPLOAD_TYPES),
  sizeBytes: z.number().int(),
  createdAt: z.iso.datetime(),
});
export const ReportDetail = registry.register(
  "ReportDetail",
  z.object({
    id: z.string(),
    caseCode: z.string(),
    category: z.enum(ReportCategory),
    description: z.string(),
    evidenceUrl: z.string().nullable(),
    status: z.enum(ReportStatus),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    closedAt: z.iso.datetime().nullable(),
    awaitingReply: z.boolean(),
    statusUpdates: z.array(ModeratorStatusUpdate),
    attachments: z.array(AttachmentInfo),
    conversation: z
      .array(ModeratorConversationEntry)
      .describe("What the reporter sees, oldest first, plus the moderator behind each entry."),
    internalNotes: z.array(InternalNoteEntry).describe("Staff only, oldest first. Never shown to the reporter."),
  }),
);
export const ReportListItem = z.object({
  id: z.string(),
  caseCode: z.string(),
  category: z.enum(ReportCategory),
  status: z.enum(ReportStatus),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  awaitingReply: z.boolean(),
});
export const ReportPage = registry.register(
  "ReportPage",
  z.object({
    items: z.array(ReportListItem),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
);
export const Moderator = registry.register(
  "Moderator",
  z.object({
    id: z.string(),
    email: z.string(),
    role: z.enum(ModeratorRole),
    isActive: z.boolean(),
    isDemo: z.boolean().describe("Public demo account: its role and active status can't be changed."),
    createdAt: z.iso.datetime(),
  }),
);
export const ReportCreated = z.object({ caseCode: z.string() });
export const UploadSignResponse = z.object({ uploadUrl: z.url(), uploadToken: z.string(), expiresIn: z.number().int() });
export const LoginResponse = z.object({ token: z.string(), tokenType: z.literal("Bearer"), expiresIn: z.number().int() });
export const AttachmentDownload = z.object({
  url: z.url(),
  expiresIn: z.literal(60),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});
export const ModeratorList = z.object({ items: z.array(Moderator) });

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const error = (description: string) => json(ErrorResponse, description);
const body = <T extends z.ZodType>(schema: T) => ({ required: true, content: { "application/json": { schema } } });

const rateLimitNote = (name: keyof typeof RATE_LIMITS) => {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  return `Rate limited to ${limit} requests per ${windowSeconds / 60} minutes per client (sliding window).`;
};

const e400 = error("Malformed JSON (BAD_REQUEST) or invalid input (VALIDATION_ERROR)");
const e401 = error("Missing, invalid or expired token, or account deactivated (UNAUTHORIZED)");
const e403 = error("Authenticated, but not an ADMIN (FORBIDDEN)");
const e404 = error("Not found (NOT_FOUND)");
const e423Conversation = error(
  "The case is CLOSED; the conversation is read-only (REPORT_CLOSED, message \"This case is closed. The conversation is read-only.\")",
);
const e429 = {
  ...error("Too many requests (RATE_LIMITED)"),
  headers: { "Retry-After": { description: "Seconds until the next request is allowed", schema: { type: "integer" as const } } },
};
const e500 = error("Unexpected error (INTERNAL_ERROR); details are never returned");
const e503 = error("Rate limiter not configured on the server (RATE_LIMITER_UNAVAILABLE)");

const idParam = (name: string) => z.object({ [name]: idSchema });

registry.registerPath({
  method: "post",
  path: "/api/reports",
  tags: ["Public"],
  summary: "Submit an anonymous report",
  description: `Returns only the case code. Attach up to 3 files by passing upload tokens from POST /api/uploads/sign. If any attachment fails, nothing is saved. ${rateLimitNote("submit")}`,
  request: { body: body(ReportSubmission) },
  responses: {
    201: json(ReportCreated, "Report created"),
    400: error("Invalid input, invalid/expired upload token (INVALID_UPLOAD_TOKEN), or a file failed validation (INVALID_UPLOAD)"),
    409: error("An upload token was already used (UPLOAD_TOKEN_USED)"),
    429: e429,
    503: e503,
    500: e500,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/reports/lookup",
  tags: ["Public"],
  summary: "Look up a report by case code (preferred)",
  description: `The case code travels in the body, so it stays out of hosting request logs. Returns the conversation (messages and status changes, PUBLIC notes only) and the PUBLIC status updates. Unknown and malformed codes get the same 404. ${rateLimitNote("lookup")} Shares its budget with GET /api/reports/{caseCode}.`,
  request: { body: body(CaseLookup) },
  responses: { 200: json(PublicReport, "The report"), 400: e400, 404: e404, 429: e429, 503: e503, 500: e500 },
});

registry.registerPath({
  method: "get",
  path: "/api/reports/{caseCode}",
  tags: ["Public"],
  summary: "Look up a report by case code (kept for compatibility)",
  description: `Identical response to POST /api/reports/lookup, which is preferred: this form puts the case code in the URL path, where hosting request logs can record it. ${rateLimitNote("lookup")}`,
  request: { params: z.object({ caseCode: z.string() }) },
  responses: { 200: json(PublicReport, "The report"), 404: e404, 429: e429, 503: e503, 500: e500 },
});

registry.registerPath({
  method: "post",
  path: "/api/reports/messages",
  tags: ["Public"],
  summary: "Send a message to the review team",
  description: `Anonymous: nothing about the sender is stored with the message. Marks the case as awaiting a reply. Unknown and malformed codes get the same 404 as the lookup. Rate limited to ${RATE_LIMITS.reporterMessage.limit} messages per ${RATE_LIMITS.reporterMessage.windowSeconds / 60} minutes per client and case code; each request also counts against the lookup budget (${RATE_LIMITS.lookup.limit} per ${RATE_LIMITS.lookup.windowSeconds / 60} minutes per client).`,
  request: { body: body(ReporterMessage) },
  responses: {
    201: json(ReporterMessageCreated, "The updated conversation"),
    400: e400,
    404: e404,
    423: e423Conversation,
    429: e429,
    503: e503,
    500: e500,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/uploads/sign",
  tags: ["Public"],
  summary: "Get a signed URL to upload one evidence file",
  description: `PUT the file to uploadUrl (directly to Supabase Storage, not through this API), then pass uploadToken in POST /api/reports within ${30} minutes. ${rateLimitNote("uploadSign")}`,
  request: { body: body(UploadSignRequest) },
  responses: {
    200: json(UploadSignResponse, "Signed upload URL and token"),
    400: e400,
    429: e429,
    503: e503,
    500: e500,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/mod/login",
  tags: ["Auth"],
  summary: "Moderator login",
  description: rateLimitNote("login"),
  request: { body: body(ModeratorLogin) },
  responses: {
    200: json(LoginResponse, "JWT for the Authorize button"),
    400: e400,
    401: error("Wrong email or password, or account deactivated (INVALID_CREDENTIALS)"),
    429: e429,
    503: e503,
    500: e500,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/mod/reports",
  tags: ["Moderator"],
  summary: "Search and filter reports",
  security: secured,
  request: { query: modReportsQuerySchema },
  responses: { 200: json(ReportPage, "One page of reports"), 400: e400, 401: e401, 500: e500 },
});

registry.registerPath({
  method: "get",
  path: "/api/mod/reports/{id}",
  tags: ["Moderator"],
  summary: "Get one report with its full history",
  security: secured,
  request: { params: idParam("id") },
  responses: { 200: json(ReportDetail, "The report"), 401: e401, 404: e404, 500: e500 },
});

registry.registerPath({
  method: "patch",
  path: "/api/mod/reports/{id}/status",
  tags: ["Moderator"],
  summary: "Change a report's status",
  description:
    "Allowed: SUBMITTED→UNDER_REVIEW, UNDER_REVIEW→RESOLVED|DISMISSED, RESOLVED|DISMISSED→CLOSED. Every status change is shown to the reporter in the conversation; the note only when visibility is PUBLIC. Closing deletes all evidence files and clears awaitingReply; the conversation stays readable. A CLOSED report is read-only.",
  security: secured,
  request: { params: idParam("id"), body: body(StatusUpdateRequest) },
  responses: {
    200: json(ReportDetail, "The updated report"),
    400: e400,
    401: e401,
    404: e404,
    409: error("Transition not allowed (INVALID_TRANSITION) or changed concurrently (CONFLICT)"),
    423: error("The report is CLOSED (REPORT_CLOSED)"),
    500: e500,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/mod/reports/{id}/messages",
  tags: ["Moderator"],
  summary: "Reply to the reporter",
  description: "Visible to the reporter, attributed only to REVIEW_TEAM. Clears awaitingReply.",
  security: secured,
  request: { params: idParam("id"), body: body(ModeratorMessage) },
  responses: {
    201: json(ReportDetail, "The updated report"),
    400: e400,
    401: e401,
    404: e404,
    423: e423Conversation,
    500: e500,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/mod/reports/{id}/notes",
  tags: ["Moderator"],
  summary: "Add an internal note",
  description: "Always INTERNAL: never visible to the reporter. Use /messages for anything the reporter should see.",
  security: secured,
  request: { params: idParam("id"), body: body(InternalNoteRequest) },
  responses: {
    201: json(ReportDetail, "The updated report"),
    400: e400,
    401: e401,
    404: e404,
    423: error("The report is CLOSED (REPORT_CLOSED)"),
    500: e500,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/mod/reports/{id}/attachments/{attachmentId}",
  tags: ["Moderator"],
  summary: "Get a 60-second signed download URL for an attachment",
  security: secured,
  request: { params: z.object({ id: idSchema, attachmentId: idSchema }) },
  responses: {
    200: json(AttachmentDownload, "Signed download URL"),
    401: e401,
    404: e404,
    500: e500,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/admin/moderators",
  tags: ["Admin"],
  summary: "List moderators",
  security: secured,
  responses: { 200: json(ModeratorList, "All moderators"), 401: e401, 403: e403, 500: e500 },
});

registry.registerPath({
  method: "post",
  path: "/api/admin/moderators",
  tags: ["Admin"],
  summary: "Create a moderator",
  security: secured,
  request: { body: body(CreateModerator) },
  responses: {
    201: json(Moderator, "Created"),
    400: e400,
    401: e401,
    403: error("Not an ADMIN (FORBIDDEN), or a demo account creating an ADMIN (DEMO_ACCOUNT_RESTRICTED)"),
    409: error("Email already in use (EMAIL_TAKEN)"),
    500: e500,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/admin/moderators/{id}",
  tags: ["Admin"],
  summary: "Change a moderator's role or active status",
  security: secured,
  request: { params: idParam("id"), body: body(UpdateModerator) },
  responses: {
    200: json(Moderator, "Updated"),
    400: e400,
    401: e401,
    403: error(
      "Not an ADMIN (FORBIDDEN); demoting/deactivating yourself (CANNOT_MODIFY_SELF); changing a demo account (DEMO_ACCOUNT_PROTECTED); or a demo account changing another account's role or status (DEMO_ACCOUNT_RESTRICTED)",
    ),
    404: e404,
    409: error("Would leave no active ADMIN (LAST_ADMIN)"),
    500: e500,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/cron/cleanup",
  tags: ["Internal"],
  summary: "Daily cleanup (Vercel Cron)",
  description:
    "Deletes staged uploads older than 1 hour and consumed upload-token records older than the 30-minute token lifetime, and restores the demo accounts (active, original roles).",
  security: [{ [cronAuth.name]: [] }],
  responses: {
    200: json(
      z.object({
        deletedStagingObjects: z.number().int(),
        deletedConsumedUploadTokens: z.number().int(),
        demoAccountsReset: z.number().int(),
      }),
      "Cleanup summary",
    ),
    401: error("Missing or wrong CRON_SECRET (UNAUTHORIZED)"),
    500: e500,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/openapi",
  tags: ["Docs"],
  summary: "This OpenAPI document",
  responses: { 200: { description: "OpenAPI 3.1 JSON" } },
});

let document: ReturnType<OpenApiGeneratorV31["generateDocument"]> | null = null;

export function getOpenApiDocument() {
  document ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "WhistleDrop API",
      version: "1.0.0",
      description:
        "Anonymous reporting backend. Public endpoints never require or store identifying information. Use POST /api/mod/login, then Authorize with the token.",
    },
    tags: [
      { name: "Public", description: "No authentication" },
      { name: "Auth" },
      { name: "Moderator", description: "Bearer token, any role" },
      { name: "Admin", description: "Bearer token, ADMIN role" },
      { name: "Internal", description: "Scheduled jobs; not for clients" },
      { name: "Docs" },
    ],
  });
  return document;
}
