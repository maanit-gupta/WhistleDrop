import { checkRateLimit } from "@/lib/rateLimit";
import { caseLookupSchema } from "@/lib/validation";
import { respondWithPublicCase } from "@/lib/caseLookup";
import { badRequest, readJson, validationError } from "@/lib/apiResponse";

// Same response as GET /api/reports/{caseCode}, but the case code travels in
// the body, never the URL path, so it stays out of hosting request logs.
export async function POST(request: Request) {
  // Counted before any validation so malformed guesses use up the budget too.
  // Shares the GET route's bucket: both are the same lookup.
  const limited = await checkRateLimit("lookup", request);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = caseLookupSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  return respondWithPublicCase(parsed.data.caseCode, "POST /api/reports/lookup");
}
