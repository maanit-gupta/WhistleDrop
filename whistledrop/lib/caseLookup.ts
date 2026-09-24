import "server-only";
import { normalizeCaseCode } from "@/lib/caseCode";
import { findPublicCase } from "@/lib/cases";
import { apiError, apiSuccess, internalError, notFound } from "@/lib/apiResponse";

/** Unknown and malformed codes get this same 404 everywhere, so neither is distinguishable. */
export const caseNotFound = () => notFound("Report not found");

/** 423 for anything that would write to a CLOSED case's conversation. */
export const conversationClosed = () =>
  apiError("REPORT_CLOSED", "This case is closed. The conversation is read-only.", 423);

/**
 * The public case lookup, shared by GET /api/reports/{caseCode} and
 * POST /api/reports/lookup. The caller applies the rate limit first.
 */
export async function respondWithPublicCase(rawCode: string, route: string): Promise<Response> {
  const caseCode = normalizeCaseCode(rawCode);
  if (!caseCode) return caseNotFound();

  try {
    const report = await findPublicCase(caseCode);
    return report ? apiSuccess(report) : caseNotFound();
  } catch (err) {
    console.error(`${route} failed:`, err instanceof Error ? err.name : "unknown");
    return internalError();
  }
}
