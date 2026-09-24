import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_TRANSITION"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "CANNOT_MODIFY_SELF"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EMAIL_TAKEN"
  | "LAST_ADMIN"
  | "DEMO_ACCOUNT_PROTECTED"
  | "DEMO_ACCOUNT_RESTRICTED"
  | "UPLOAD_TOKEN_USED"
  | "INVALID_UPLOAD_TOKEN"
  | "INVALID_UPLOAD"
  | "REPORT_CLOSED"
  | "RATE_LIMITED"
  | "RATE_LIMITER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// Responses carry sensitive data; never let browsers or proxies cache them.
const NO_STORE = { "Cache-Control": "no-store" };

export function apiError(
  code: ApiErrorCode | string,
  message: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status, headers: { ...NO_STORE, ...headers } });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export const badRequest = (message = "Malformed request") => apiError("BAD_REQUEST", message, 400);

export const validationError = (err: ZodError) => {
  const issue = err.issues[0];
  const path = issue?.path.join(".");
  const message = issue ? (path ? `${path}: ${issue.message}` : issue.message) : "Invalid input";
  return apiError("VALIDATION_ERROR", message, 400);
};

export const invalidTransition = (message = "Status transition not allowed") =>
  apiError("INVALID_TRANSITION", message, 409);

export const unauthorized = (message = "Authentication required") => apiError("UNAUTHORIZED", message, 401);

export const forbidden = (message = "Forbidden") => apiError("FORBIDDEN", message, 403);

export const notFound = (message = "Not found") => apiError("NOT_FOUND", message, 404);

export const conflict = (message = "Conflict") => apiError("CONFLICT", message, 409);

/** 423: the resource exists but is permanently read-only (a CLOSED report). */
export const locked = (message = "This report is closed and can no longer be changed") =>
  apiError("REPORT_CLOSED", message, 423);

export const rateLimited = (retryAfterSeconds: number, message = "Too many requests, please try again later") =>
  apiError("RATE_LIMITED", message, 429, { "Retry-After": String(retryAfterSeconds) });

/** Never leak internal details (stack traces, Prisma errors) to clients. */
export const internalError = (message = "Something went wrong") => apiError("INTERNAL_ERROR", message, 500);

/** Parses a JSON request body without throwing; `ok: false` means malformed JSON. */
export async function readJson(request: Request): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return { ok: false };
  }
}
