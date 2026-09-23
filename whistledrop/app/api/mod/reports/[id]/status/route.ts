import { prisma } from "@/lib/db";
import { withModerator } from "@/lib/guards";
import { moderatorReportDetail } from "@/lib/reports";
import { listObjects, removeObjects } from "@/lib/storage";
import { isValidTransition } from "@/lib/transitions.shared";
import { reportIdSchema, statusUpdateRequestSchema } from "@/lib/validation";
import {
  apiSuccess,
  badRequest,
  conflict,
  internalError,
  invalidTransition,
  locked,
  notFound,
  readJson,
  validationError,
} from "@/lib/apiResponse";

// Prisma's defaults (2s to acquire a connection, 5s total) are too tight when the
// app and database are far apart or a new pooled connection must be opened.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

export const PATCH = withModerator(
  async (request: Request, ctx: RouteContext<"/api/mod/reports/[id]/status">, moderator) => {
    const { id } = await ctx.params;
    if (!reportIdSchema.safeParse(id).success) return notFound("Report not found");

    const body = await readJson(request);
    if (!body.ok) return badRequest("Request body must be valid JSON");

    const parsed = statusUpdateRequestSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);
    const { newStatus, note, visibility } = parsed.data;

    try {
      const current = await prisma.report.findUnique({
        where: { id },
        select: { status: true, attachments: { select: { storagePath: true } } },
      });
      if (!current) return notFound("Report not found");
      if (current.status === "CLOSED") return locked();
      if (!isValidTransition(current.status, newStatus)) {
        return invalidTransition(`Cannot change status from ${current.status} to ${newStatus}`);
      }

      const closing = newStatus === "CLOSED";
      if (closing) {
        // Evidence is deleted from storage BEFORE the report is marked closed.
        // If this fails nothing has changed and the close can be retried; the
        // reverse order could leave a closed report whose files still exist.
        // Listing the folder also catches files without a row (e.g. left over
        // from a failed cleanup). Only CLOSED can follow RESOLVED/DISMISSED,
        // so there is no path where the files are needed again.
        const paths = new Set(current.attachments.map((a) => a.storagePath));
        for (const path of await listObjects(`reports/${id}`)) paths.add(path);
        await removeObjects([...paths]);
      }

      const result = await prisma.$transaction(async (tx) => {
        // Only matches if the status is still the one we validated against, so a
        // concurrent change by another moderator can't be overwritten.
        const { count } = await tx.report.updateMany({
          where: { id, status: current.status },
          data: { status: newStatus, ...(closing && { closedAt: new Date() }) },
        });
        if (count === 0) {
          const now = await tx.report.findUnique({ where: { id }, select: { status: true } });
          return { kind: now?.status === "CLOSED" ? "locked" : "conflict" } as const;
        }

        await tx.statusUpdate.create({
          data: { reportId: id, newStatus, note, visibility, moderatorId: moderator.id },
        });
        if (closing) await tx.attachment.deleteMany({ where: { reportId: id } });

        const report = await tx.report.findUniqueOrThrow({ where: { id }, include: moderatorReportDetail });
        return { kind: "ok", report } as const;
      }, TRANSACTION_OPTIONS);

      switch (result.kind) {
        case "ok":
          return apiSuccess(result.report);
        case "locked":
          return locked();
        case "conflict":
          return conflict("Report status changed while updating; reload and try again");
      }
    } catch (err) {
      console.error("PATCH /api/mod/reports/[id]/status failed:", err);
      return internalError();
    }
  },
);
