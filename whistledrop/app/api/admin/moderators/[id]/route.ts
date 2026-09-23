import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/guards";
import { idSchema, updateModeratorSchema } from "@/lib/validation";
import {
  apiError,
  apiSuccess,
  badRequest,
  forbidden,
  internalError,
  notFound,
  readJson,
  validationError,
} from "@/lib/apiResponse";

export const PATCH = withAdmin(async (request: Request, ctx: RouteContext<"/api/admin/moderators/[id]">, admin) => {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return notFound("Moderator not found");

  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = updateModeratorSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { role, isActive } = parsed.data;

  const removesAdmin = role === "MODERATOR" || isActive === false;
  if (id === admin.id && removesAdmin) {
    return apiError("CANNOT_MODIFY_SELF", "You cannot deactivate or demote your own account", 403);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock every active admin row. A concurrent change that could also remove
      // an admin waits here and then sees the committed result, so two admins
      // demoting each other at the same moment can't leave zero admins.
      // (Self-protection above means this can only trigger when two admins
      // demote or deactivate each other concurrently.)
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Moderator" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;

      const target = await tx.moderator.findUnique({ where: { id }, select: { role: true, isActive: true } });
      if (!target) return { kind: "not_found" } as const;

      const targetIsActiveAdmin = target.role === "ADMIN" && target.isActive;
      if (targetIsActiveAdmin && removesAdmin && admins.length <= 1) return { kind: "last_admin" } as const;

      // The caller may have been demoted or deactivated while this request waited.
      if (!admins.some((a) => a.id === admin.id)) return { kind: "forbidden" } as const;

      const moderator = await tx.moderator.update({
        where: { id },
        data: { role, isActive },
        select: { id: true, email: true, role: true, isActive: true, createdAt: true },
      });
      return { kind: "ok", moderator } as const;
    });

    switch (result.kind) {
      case "ok":
        return apiSuccess(result.moderator);
      case "forbidden":
        return forbidden("Administrator access required");
      case "not_found":
        return notFound("Moderator not found");
      case "last_admin":
        return apiError("LAST_ADMIN", "At least one active administrator must remain", 409);
    }
  } catch (err) {
    console.error("PATCH /api/admin/moderators/[id] failed:", err);
    return internalError();
  }
});
