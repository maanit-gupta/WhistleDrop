import { prisma } from "@/lib/db";
import { createReport } from "@/lib/cases";
import { checkRateLimit } from "@/lib/rateLimit";
import { reportSubmissionSchema } from "@/lib/validation";
import {
  UploadError,
  discardStoredAttachments,
  newId,
  storeAttachments,
  verifyUploadTokens,
  type StoredAttachment,
} from "@/lib/uploads";
import { removeObjects } from "@/lib/storage";
import { apiError, apiSuccess, badRequest, internalError, readJson, validationError } from "@/lib/apiResponse";

const uploadErrorResponse = (err: UploadError) =>
  apiError(err.code, err.message, err.code === "UPLOAD_TOKEN_USED" ? 409 : 400);

// PRIVACY: this handler must never read or persist anything that could identify
// the reporter (IP, headers, cookies, user agent). Only the validated body is
// used; the IP is seen only by the rate limiter, which keeps a daily-salted hash.
export async function POST(request: Request) {
  const limited = await checkRateLimit("submit", request);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = reportSubmissionSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { attachments: tokens = [], ...report } = parsed.data;

  let stored: StoredAttachment[] = [];
  try {
    const uploads = await verifyUploadTokens(tokens);
    if (uploads.length > 0) {
      const used = await prisma.consumedUploadToken.count({ where: { jti: { in: uploads.map((u) => u.jti) } } });
      if (used > 0) throw new UploadError("UPLOAD_TOKEN_USED", "Upload token has already been used");
    }

    const reportId = newId();
    stored = await storeAttachments(reportId, uploads);

    // One transaction: the report, its attachments and the token consumption
    // either all exist afterwards or none do.
    const { caseCode } = await createReport(report, {
      id: reportId,
      attachments: stored,
      consumedTokenIds: uploads.map((u) => u.jti),
    });

    // Committed: the staging copies are no longer needed. Failure here only
    // leaves an orphaned staging object; the tokens are already consumed.
    await removeObjects(uploads.map((u) => u.path)).catch((err) =>
      console.error("Staging cleanup failed:", err instanceof Error ? err.name : "unknown"),
    );
    return apiSuccess({ caseCode }, 201);
  } catch (err) {
    await discardStoredAttachments(stored);
    if (err instanceof UploadError) return uploadErrorResponse(err);
    // Log only the error type: Prisma messages can echo submitted report content.
    console.error("POST /api/reports failed:", err instanceof Error ? err.name : "unknown");
    return internalError();
  }
}
