import { prisma } from "@/lib/db";
import { CASE_CODE_PATTERN } from "@/lib/caseCode";
import { checkRateLimit } from "@/lib/rateLimit";
import { apiSuccess, internalError, notFound } from "@/lib/apiResponse";

const NOT_FOUND_MESSAGE = "Report not found";

export async function GET(request: Request, ctx: RouteContext<"/api/reports/[caseCode]">) {
  // Counted before any validation so malformed guesses use up the budget too.
  const limited = await checkRateLimit("lookup", request);
  if (limited) return limited;

  const caseCode = (await ctx.params).caseCode.trim().toUpperCase();

  // Malformed and unknown codes get the same response, so neither is distinguishable.
  if (!CASE_CODE_PATTERN.test(caseCode)) return notFound(NOT_FOUND_MESSAGE);

  try {
    // Only PUBLIC updates, and only these three fields: never the internal ids,
    // the note's visibility, or anything about the moderator who wrote it.
    const report = await prisma.report.findUnique({
      where: { caseCode },
      select: {
        category: true,
        description: true,
        evidenceUrl: true,
        status: true,
        createdAt: true,
        statusUpdates: {
          where: { visibility: "PUBLIC" },
          select: { note: true, newStatus: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!report) return notFound(NOT_FOUND_MESSAGE);
    return apiSuccess(report);
  } catch (err) {
    console.error("GET /api/reports/[caseCode] failed:", err instanceof Error ? err.name : "unknown");
    return internalError();
  }
}
