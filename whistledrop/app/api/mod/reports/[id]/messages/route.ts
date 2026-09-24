import { withModerator } from "@/lib/guards";
import { postModeratorMessage } from "@/lib/cases";
import { conversationClosed } from "@/lib/caseLookup";
import { moderatorMessageSchema, reportIdSchema } from "@/lib/validation";
import { apiSuccess, badRequest, internalError, notFound, readJson, validationError } from "@/lib/apiResponse";

// A reply the reporter will see, attributed to them only as "REVIEW_TEAM".
// The acting moderator is recorded for staff accountability.
export const POST = withModerator(
  async (request: Request, ctx: RouteContext<"/api/mod/reports/[id]/messages">, moderator) => {
    const { id } = await ctx.params;
    if (!reportIdSchema.safeParse(id).success) return notFound("Report not found");

    const body = await readJson(request);
    if (!body.ok) return badRequest("Request body must be valid JSON");

    const parsed = moderatorMessageSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    try {
      const result = await postModeratorMessage(id, moderator.id, parsed.data.body);
      switch (result.kind) {
        case "ok":
          return apiSuccess(result.report, 201);
        case "not_found":
          return notFound("Report not found");
        case "closed":
          return conversationClosed();
      }
    } catch (err) {
      console.error("POST /api/mod/reports/[id]/messages failed:", err instanceof Error ? err.name : "unknown");
      return internalError();
    }
  },
);
