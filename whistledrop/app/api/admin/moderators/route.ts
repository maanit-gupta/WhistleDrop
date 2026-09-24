import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAdmin } from "@/lib/guards";
import { createModeratorSchema } from "@/lib/validation";
import { apiError, apiSuccess, badRequest, internalError, readJson, validationError } from "@/lib/apiResponse";

const BCRYPT_COST = 12;

/** Never includes passwordHash. */
const publicModeratorFields = { id: true, email: true, role: true, isActive: true, isDemo: true, createdAt: true } as const;

export const GET = withAdmin(async () => {
  try {
    const items = await prisma.moderator.findMany({ select: publicModeratorFields, orderBy: { createdAt: "asc" } });
    return apiSuccess({ items });
  } catch (err) {
    console.error("GET /api/admin/moderators failed:", err);
    return internalError();
  }
});

export const POST = withAdmin(async (request: Request, _ctx: unknown, admin) => {
  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = createModeratorSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { email, password, role } = parsed.data;

  // Demo credentials are public. An ADMIN made by a demo account would be a
  // non-demo admin controlled by anyone, able to deactivate the real admins.
  if (admin.isDemo && role !== "MODERATOR") {
    return apiError("DEMO_ACCOUNT_RESTRICTED", "Demo accounts can only create MODERATOR accounts", 403);
  }

  try {
    const moderator = await prisma.moderator.create({
      data: { email, role, passwordHash: await bcrypt.hash(password, BCRYPT_COST) },
      select: publicModeratorFields,
    });
    return apiSuccess(moderator, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError("EMAIL_TAKEN", "A moderator with this email already exists", 409);
    }
    console.error("POST /api/admin/moderators failed:", err);
    return internalError();
  }
});
