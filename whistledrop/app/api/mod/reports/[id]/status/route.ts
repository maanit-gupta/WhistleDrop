import { withModerator } from "@/lib/guards";
import { changeStatus } from "@/lib/cases";
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

export const PATCH = withModerator(
  async (request: Request, ctx: RouteContext<"/api/mod/reports/[id]/status">, moderator) => {
    const { id } = await ctx.params;
    if (!reportIdSchema.safeParse(id).success) return notFound("Report not found");

    const body = await readJson(request);
    if (!body.ok) return badRequest("Request body must be valid JSON");

    const parsed = statusUpdateRequestSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    try {
      // See changeStatus (lib/cases.ts): closing purges evidence before the
      // status changes, and a concurrent change is detected, not overwritten.
      const result = await changeStatus(id, moderator.id, parsed.data);
      switch (result.kind) {
        case "ok":
          return apiSuccess(result.report);
        case "not_found":
          return notFound("Report not found");
        case "locked":
          return locked();
        case "invalid_transition":
          return invalidTransition(`Cannot change status from ${result.from} to ${parsed.data.newStatus}`);
        case "conflict":
          return conflict("Report status changed while updating; reload and try again");
      }
    } catch (err) {
      console.error("PATCH /api/mod/reports/[id]/status failed:", err);
      return internalError();
    }
  },
);
