import { checkRateLimit } from "@/lib/rateLimit";
import { respondWithPublicCase } from "@/lib/caseLookup";

// Kept for API compatibility. POST /api/reports/lookup is preferred: it takes
// the code in the body, so it doesn't end up in hosting request logs.
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[caseCode]">) {
  // Counted before any validation so malformed guesses use up the budget too.
  const limited = await checkRateLimit("lookup", request);
  if (limited) return limited;

  return respondWithPublicCase((await ctx.params).caseCode, "GET /api/reports/[caseCode]");
}
