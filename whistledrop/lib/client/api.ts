import type { z } from "zod";
import type { ApiErrorCode } from "@/lib/apiResponse";
import type {
  AttachmentDownload as AttachmentDownloadSchema,
  LoginResponse as LoginResponseSchema,
  Moderator as ModeratorSchema,
  ModeratorList as ModeratorListSchema,
  PublicReport as PublicReportSchema,
  ReportCreated as ReportCreatedSchema,
  ReportDetail as ReportDetailSchema,
  ReportListItem as ReportListItemSchema,
  ReportPage as ReportPageSchema,
  UploadSignResponse as UploadSignResponseSchema,
} from "@/lib/openapi";
import type {
  createModeratorSchema,
  modReportsQuerySchema,
  moderatorLoginSchema,
  reportSubmissionSchema,
  statusUpdateRequestSchema,
  updateModeratorSchema,
  uploadSignRequestSchema,
} from "@/lib/validation";
import { clearToken, getToken } from "@/lib/client/session";

// Typed client for the WhistleDrop API. One function per endpoint in
// docs/frontend-api-contract.md; nothing else.
//
// Every import above except session is `import type`: the schemas are
// server-only and must never be bundled for the browser. Types come from them
// via z.infer (responses) and z.input (request bodies, before defaults).
//
// PRIVACY RULE: case codes must never appear in page URLs (address bar,
// history, links, query strings), in browser storage (local/session storage,
// IndexedDB, cookies), or in console output. This module never logs, never
// stores a case code, and never puts one anywhere but the lookup request
// itself. Callers must keep it that way: hold case codes in React state only.
// (The lookup endpoint takes the code in its request path; see "Open issues"
// in the contract.)

// ── Types ────────────────────────────────────────────────────────────────

export type ReportSubmissionInput = z.input<typeof reportSubmissionSchema>;
export type UploadSignInput = z.input<typeof uploadSignRequestSchema>;
export type LoginInput = z.input<typeof moderatorLoginSchema>;
export type StatusUpdateInput = z.input<typeof statusUpdateRequestSchema>;
export type CreateModeratorInput = z.input<typeof createModeratorSchema>;
export type UpdateModeratorInput = z.input<typeof updateModeratorSchema>;

type ParsedReportsQuery = z.infer<typeof modReportsQuerySchema>;
/** GET /api/mod/reports filters. Arrays are sent as CSV; dates as YYYY-MM-DD or ISO with offset. */
export type ReportsQuery = Partial<{
  q: string;
  status: NonNullable<ParsedReportsQuery["status"]>;
  category: NonNullable<ParsedReportsQuery["category"]>;
  from: string;
  to: string;
  sort: ParsedReportsQuery["sort"];
  order: ParsedReportsQuery["order"];
  page: number;
  pageSize: number;
}>;

export type PublicReport = z.infer<typeof PublicReportSchema>;
export type ReportCreated = z.infer<typeof ReportCreatedSchema>;
export type UploadSignResponse = z.infer<typeof UploadSignResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type ReportPage = z.infer<typeof ReportPageSchema>;
export type ReportListItem = z.infer<typeof ReportListItemSchema>;
export type ReportDetail = z.infer<typeof ReportDetailSchema>;
export type AttachmentDownload = z.infer<typeof AttachmentDownloadSchema>;
export type Moderator = z.infer<typeof ModeratorSchema>;
export type ModeratorList = z.infer<typeof ModeratorListSchema>;

/** Codes the server sends, plus two the client produces itself. */
export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "UNEXPECTED_RESPONSE";

export interface ApiFailure {
  ok: false;
  /** HTTP status; 0 when the request never got a response (offline, aborted, blocked). */
  status: number;
  code: ClientErrorCode;
  message: string;
  /** Seconds, from Retry-After (sent with 429). */
  retryAfterSeconds: number | null;
}
export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}
/**
 * Never throws for HTTP or network errors: branch on `ok`, then on `status`
 * (400, 401, 403, 404, 409, 423, 429, 503, …) or `code`.
 */
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

interface RequestOptions {
  signal?: AbortSignal;
}

// ── Core ─────────────────────────────────────────────────────────────────

const AUTHENTICATED = /^\/api\/(mod|admin)\//;
const LOGIN = "/api/mod/login";

/** Seconds from a Retry-After header (delta-seconds or HTTP date). */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function isErrorBody(body: unknown): body is { error: { code: string; message: string } } {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  { signal }: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const authenticated = AUTHENTICATED.test(path) && path !== LOGIN;
  if (authenticated) {
    const token = getToken();
    if (!token) {
      return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Please sign in", retryAfterSeconds: null };
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
      credentials: "omit", // the API uses no cookies; send none
      referrerPolicy: "no-referrer",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "Couldn't reach WhistleDrop. Check your connection and try again.",
      retryAfterSeconds: null,
    };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Non-JSON body (e.g. a platform error page); handled below.
  }

  if (response.ok) {
    if (json === null) {
      return {
        ok: false,
        status: response.status,
        code: "UNEXPECTED_RESPONSE",
        message: "The server sent an unexpected response.",
        retryAfterSeconds: null,
      };
    }
    return { ok: true, status: response.status, data: json as T };
  }

  // A rejected token (expired, deactivated account) is useless: drop it so the
  // UI falls back to the sign-in screen.
  if (authenticated && response.status === 401) clearToken();

  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  if (isErrorBody(json)) {
    return {
      ok: false,
      status: response.status,
      code: json.error.code as ClientErrorCode,
      message: json.error.message,
      retryAfterSeconds,
    };
  }
  return {
    ok: false,
    status: response.status,
    code: "UNEXPECTED_RESPONSE",
    message: "Something went wrong. Please try again.",
    retryAfterSeconds,
  };
}

const segment = (value: string) => encodeURIComponent(value);

// ── Public ───────────────────────────────────────────────────────────────

/** POST /api/reports → 201 { caseCode }. Keep the returned code in memory only. */
export const submitReport = (body: ReportSubmissionInput, opts?: RequestOptions) =>
  request<ReportCreated>("POST", "/api/reports", body, opts);

/**
 * GET /api/reports/{caseCode}. Unknown and malformed codes both give 404.
 * The code goes into this fetch's path only; never into the page URL.
 */
export const lookupReport = (caseCode: string, opts?: RequestOptions) =>
  request<PublicReport>("GET", `/api/reports/${segment(caseCode.trim().toUpperCase())}`, undefined, opts);

/** POST /api/uploads/sign → a Supabase upload URL + token for one file. */
export const signUpload = (body: UploadSignInput, opts?: RequestOptions) =>
  request<UploadSignResponse>("POST", "/api/uploads/sign", body, opts);

export interface UploadOptions extends RequestOptions {
  /** 0–1, from upload progress events. */
  onProgress?: (fraction: number) => void;
}

/**
 * PUTs one file to the signed Supabase Storage URL from signUpload, the same
 * way supabase-js `uploadToSignedUrl` does (multipart, no upsert). XHR rather
 * than fetch because fetch has no upload progress. Resolves ok:false with
 * status 0 on network failure or abort.
 */
export function uploadToSignedUrl(uploadUrl: string, file: File, { onProgress, signal }: UploadOptions = {}) {
  return new Promise<ApiResult<null>>((resolve) => {
    const fail = (status: number, message: string) =>
      resolve({
        ok: false,
        status,
        code: status === 0 ? "NETWORK_ERROR" : "UNEXPECTED_RESPONSE",
        message,
        retryAfterSeconds: null,
      });

    if (signal?.aborted) return fail(0, "Upload cancelled");

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve({ ok: true, status: xhr.status, data: null });
      } else {
        fail(xhr.status, "The file couldn't be uploaded. Please try again.");
      }
    };
    xhr.onerror = () => fail(0, "The upload was interrupted. Check your connection and try again.");
    xhr.onabort = () => fail(0, "Upload cancelled");
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

// ── Moderator ────────────────────────────────────────────────────────────

/** POST /api/mod/login. Store `data.token` with setToken() from lib/client/session. */
export const login = (body: LoginInput, opts?: RequestOptions) =>
  request<LoginResponse>("POST", LOGIN, body, opts);

function reportsQueryString(query: ReportsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** GET /api/mod/reports. `q` may be a case code: this is an API query string, never a page URL. */
export const listReports = (query: ReportsQuery = {}, opts?: RequestOptions) =>
  request<ReportPage>("GET", `/api/mod/reports${reportsQueryString(query)}`, undefined, opts);

/** GET /api/mod/reports/{id} (internal id, not the case code). */
export const getReport = (id: string, opts?: RequestOptions) =>
  request<ReportDetail>("GET", `/api/mod/reports/${segment(id)}`, undefined, opts);

/** PATCH /api/mod/reports/{id}/status. 409 INVALID_TRANSITION / CONFLICT, 423 REPORT_CLOSED. */
export const updateReportStatus = (id: string, body: StatusUpdateInput, opts?: RequestOptions) =>
  request<ReportDetail>("PATCH", `/api/mod/reports/${segment(id)}/status`, body, opts);

/** GET a 60-second signed download URL. Call on click; don't prefetch. */
export const getAttachmentUrl = (reportId: string, attachmentId: string, opts?: RequestOptions) =>
  request<AttachmentDownload>(
    "GET",
    `/api/mod/reports/${segment(reportId)}/attachments/${segment(attachmentId)}`,
    undefined,
    opts,
  );

// ── Admin ────────────────────────────────────────────────────────────────

export const listModerators = (opts?: RequestOptions) =>
  request<ModeratorList>("GET", "/api/admin/moderators", undefined, opts);

/** 409 EMAIL_TAKEN. */
export const createModerator = (body: CreateModeratorInput, opts?: RequestOptions) =>
  request<Moderator>("POST", "/api/admin/moderators", body, opts);

/** 403 CANNOT_MODIFY_SELF, 409 LAST_ADMIN. */
export const updateModerator = (id: string, body: UpdateModeratorInput, opts?: RequestOptions) =>
  request<Moderator>("PATCH", `/api/admin/moderators/${segment(id)}`, body, opts);
