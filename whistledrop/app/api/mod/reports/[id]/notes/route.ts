import { withModerator } from "@/lib/guards";
import { addInternalNote } from "@/lib/cases";
import { internalNoteSchema, reportIdSchema } from "@/lib/validation";
import { apiSuccess, badRequest, internalError, locked, notFound, readJson, validationError } from "@/lib/apiResponse";

// Staff-only notes. There is deliberately no visibility option: anything meant
// for the reporter goes through POST /api/mod/reports/{id}/messages.
export const POST = withModerator(
  async (request: Request, ctx: RouteContext<"/api/mod/reports/[id]/notes">, moderator) => {
    const { id } = await ctx.params;
    if (!reportIdSchema.safeParse(id).success) return notFound("Report not found");

    const body = await readJson(request);
    if (!body.ok) return badRequest("Request body must be valid JSON");

    const parsed = internalNoteSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const result = await addInternalNote(id, moderator.id, parsed.data.body);
      switch (result.kind) {
        case "ok":
          return apiSuccess(result.report, 201);
        case "not_found":
          return notFound("Report not found");
        case "closed":
          return locked();
      }
    } catch (err) {
      console.error("POST /api/mod/reports/[id]/notes failed:", err instanceof Error ? err.name : "unknown");
      return internalError();
    }
  },
);
