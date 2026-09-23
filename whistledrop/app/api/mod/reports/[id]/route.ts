import { prisma } from "@/lib/db";
import { withModerator } from "@/lib/guards";
import { moderatorReportDetail } from "@/lib/reports";
import { reportIdSchema } from "@/lib/validation";
import { apiSuccess, internalError, notFound } from "@/lib/apiResponse";

export const GET = withModerator(async (_request: Request, ctx: RouteContext<"/api/mod/reports/[id]">) => {
  const { id } = await ctx.params;
  if (!reportIdSchema.safeParse(id).success) return notFound("Report not found");

  try {
    const report = await prisma.report.findUnique({ where: { id }, include: moderatorReportDetail });
    if (!report) return notFound("Report not found");
    return apiSuccess(report);
  } catch (err) {
    console.error("GET /api/mod/reports/[id] failed:", err);
    return internalError();
  }
});
