import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withModerator } from "@/lib/guards";
import { modReportsQuerySchema } from "@/lib/validation";
import { apiSuccess, internalError, validationError } from "@/lib/apiResponse";

/** Escapes LIKE wildcards so a search for "100%" matches the literal text. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const GET = withModerator(async (request: NextRequest) => {
  const parsed = modReportsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const { q, status, category, from, to, sort, order, page, pageSize } = parsed.data;

  const where: Prisma.ReportWhereInput = {
    ...(status && { status: { in: status } }),
    ...(category && { category: { in: category } }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    ...(q && {
      OR: [
        { description: { contains: escapeLike(q), mode: "insensitive" } },
        { caseCode: { contains: escapeLike(q), mode: "insensitive" } },
      ],
    }),
  };

  try {
    // Same snapshot for the count and the page. The id tiebreaker keeps page
    // boundaries stable when many rows share a sort value (e.g. status).
    const [total, items] = await prisma.$transaction([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        orderBy: [{ [sort]: order }, { id: order }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          caseCode: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
        },
      }),
    ]);
    return apiSuccess({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error("GET /api/mod/reports failed:", err);
    return internalError();
  }
});
