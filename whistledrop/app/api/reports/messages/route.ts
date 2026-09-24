import { normalizeCaseCode } from "@/lib/caseCode";
import { postReporterMessage } from "@/lib/cases";
import { caseNotFound, conversationClosed } from "@/lib/caseLookup";
import { checkRateLimit } from "@/lib/rateLimit";
import { reporterMessageSchema } from "@/lib/validation";
import { apiSuccess, badRequest, internalError, readJson, validationError } from "@/lib/apiResponse";

// PRIVACY: like report submission, this handler reads nothing about the sender
// (IP, headers, cookies, user agent) except through the rate limiter, which
// only keeps a daily-salted hash. The message row holds the text alone.
export async function POST(request: Request) {
  // A wrong code answers 404, so this endpoint is also a lookup: it shares the
  // lookup endpoints' per-IP budget, so it can't be used to guess codes faster.
  const lookupLimited = await checkRateLimit("lookup", request);
  if (lookupLimited) return lookupLimited;

  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = reporterMessageSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const caseCode = normalizeCaseCode(parsed.data.caseCode);
  const limited = await checkRateLimit("reporterMessage", request, caseCode ?? parsed.data.caseCode.trim().toUpperCase());
  if (limited) return limited;
  if (!caseCode) return caseNotFound();

  try {
    const result = await postReporterMessage(caseCode, parsed.data.body);
    switch (result.kind) {
      case "ok":
        return apiSuccess({ conversation: result.conversation }, 201);
      case "not_found":
        return caseNotFound();
      case "closed":
        return conversationClosed();
    }
  } catch (err) {
    // Log only the error type: Prisma messages can echo the message text.
    console.error("POST /api/reports/messages failed:", err instanceof Error ? err.name : "unknown");
    return internalError();
  }
}
