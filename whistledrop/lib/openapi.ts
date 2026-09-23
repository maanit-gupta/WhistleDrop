import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ModeratorRole, NoteVisibility, ReportCategory, ReportStatus } from "@prisma/client";
import {
  ALLOWED_UPLOAD_TYPES,
  createModeratorSchema,
  idSchema,
  modReportsQuerySchema,
  moderatorLoginSchema,
  reportSubmissionSchema,
  statusUpdateRequestSchema,
  updateModeratorSchema,
  uploadSignRequestSchema,
} from "@/lib/validation";
import { RATE_LIMITS } from "@/lib/rateLimit";

// The OpenAPI document is generated from the same Zod schemas the routes use
// to validate requests (lib/validation.ts), so the docs can't drift from the
// validation. Response shapes had no schemas before; they're declared once here.

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

// Response shapes.
const ErrorResponse = registry.register(
  "Error",
  z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
);
const PublicStatusUpdate = z.object({
  note: z.string().nullable(),
  newStatus: z.enum(ReportStatus),
  createdAt: z.iso.datetime(),
});
const PublicReport = registry.register(
  "PublicReport",
  z.object({
    category: z.enum(ReportCategory),
    description: z.string(),
    evidenceUrl: z.string().nullable(),
    status: z.enum(ReportStatus),
    createdAt: z.iso.datetime(),
    statusUpdates: z.array(PublicStatusUpdate).describe("PUBLIC updates only; no ids or moderator details."),
  }),
);
const ModeratorStatusUpdate = z.object({
  id: z.string(),
  note: z.string().nullable(),
  visibility: z.enum(NoteVisibility),
  newStatus: z.enum(ReportStatus),
  createdAt: z.iso.datetime(),
  moderatorId: z.string().nullable(),
  moderator: z.object({ id: z.string(), email: z.string() }).nullable(),
});
const AttachmentInfo = z.object({
  id: z.string(),
  mimeType: z.enum(ALLOWED_UPLOAD_TYPES),
  sizeBytes: z.number().int(),
  createdAt: z.iso.datetime(),
});
const ReportDetail = registry.register(
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
    statusUpdates: z.array(ModeratorStatusUpdate),
    attachments: z.array(AttachmentInfo),
  }),
);
const ReportListItem = z.object({
  id: z.string(),
  caseCode: z.string(),
  category: z.enum(ReportCategory),
  status: z.enum(ReportStatus),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
});
const ReportPage = registry.register(
  "ReportPage",
  z.object({
    items: z.array(ReportListItem),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
);
const Moderator = registry.register(
  "Moderator",
  z.object({
    id: z.string(),
    email: z.string(),
    role: z.enum(ModeratorRole),
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
);

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
    201: json(z.object({ caseCode: z.string() }), "Report created"),
    400: error("Invalid input, invalid/expired upload token (INVALID_UPLOAD_TOKEN), or a file failed validation (INVALID_UPLOAD)"),
    409: error("An upload token was already used (UPLOAD_TOKEN_USED)"),
    429: e429,
    503: e503,
    500: e500,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/reports/{caseCode}",
  tags: ["Public"],
  summary: "Look up a report by case code",
  description: `Returns PUBLIC status updates only. Unknown and malformed codes get the same 404. ${rateLimitNote("lookup")}`,
  request: { params: z.object({ caseCode: z.string() }) },
  responses: { 200: json(PublicReport, "The report"), 404: e404, 429: e429, 503: e503, 500: e500 },
});

registry.registerPath({
  method: "post",
  path: "/api/uploads/sign",
  tags: ["Public"],
  summary: "Get a signed URL to upload one evidence file",
  description: `PUT the file to uploadUrl (directly to Supabase Storage, not through this API), then pass uploadToken in POST /api/reports within ${30} minutes. ${rateLimitNote("uploadSign")}`,
  request: { body: body(UploadSignRequest) },
  responses: {
    200: json(
      z.object({ uploadUrl: z.url(), uploadToken: z.string(), expiresIn: z.number().int() }),
      "Signed upload URL and token",
    ),
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
    200: json(
      z.object({ token: z.string(), tokenType: z.literal("Bearer"), expiresIn: z.number().int() }),
      "JWT for the Authorize button",
    ),
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
    "Allowed: SUBMITTED→UNDER_REVIEW, UNDER_REVIEW→RESOLVED|DISMISSED, RESOLVED|DISMISSED→CLOSED. Closing deletes all evidence files. A CLOSED report is read-only.",
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
  method: "get",
  path: "/api/mod/reports/{id}/attachments/{attachmentId}",
  tags: ["Moderator"],
  summary: "Get a 60-second signed download URL for an attachment",
  security: secured,
  request: { params: z.object({ id: idSchema, attachmentId: idSchema }) },
  responses: {
    200: json(
      z.object({ url: z.url(), expiresIn: z.literal(60), mimeType: z.string(), sizeBytes: z.number().int() }),
      "Signed download URL",
    ),
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
  responses: { 200: json(z.object({ items: z.array(Moderator) }), "All moderators"), 401: e401, 403: e403, 500: e500 },
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
    403: e403,
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
    403: error("Not an ADMIN (FORBIDDEN), or demoting/deactivating yourself (CANNOT_MODIFY_SELF)"),
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
    "Deletes staged uploads older than 1 hour and consumed upload-token records older than the 30-minute token lifetime.",
  security: [{ [cronAuth.name]: [] }],
  responses: {
    200: json(
      z.object({ deletedStagingObjects: z.number().int(), deletedConsumedUploadTokens: z.number().int() }),
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
