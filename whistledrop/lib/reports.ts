import type { Prisma } from "@prisma/client";

/**
 * What moderator endpoints return for one report: every status update (PUBLIC
 * and INTERNAL) with the acting moderator, plus attachment metadata. Storage
 * paths stay internal; files are fetched through the signed-URL endpoint.
 */
export const moderatorReportDetail = {
  statusUpdates: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      note: true,
      visibility: true,
      newStatus: true,
      createdAt: true,
      moderatorId: true,
      moderator: { select: { id: true, email: true } },
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, mimeType: true, sizeBytes: true, createdAt: true },
  },
} satisfies Prisma.ReportInclude;
