import "server-only";
import type { ModeratorRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyModeratorToken } from "@/lib/auth";
import { forbidden, internalError, unauthorized } from "@/lib/apiResponse";

/** The acting moderator, as currently stored in the database (not as claimed by the token). */
export interface AuthenticatedModerator {
  id: string;
  email: string;
  role: ModeratorRole;
  /** A public demo account: may not change any account's role or active status. */
  isDemo: boolean;
}

async function authenticate(request: Request): Promise<AuthenticatedModerator | Response> {
  const token = await verifyModeratorToken(request);
  if (!token) return unauthorized();

  try {
    // Checked on every request so deactivation and role changes apply
    // immediately, not when the 12-hour token expires.
    const moderator = await prisma.moderator.findUnique({
      where: { id: token.sub },
      select: { id: true, email: true, role: true, isActive: true, isDemo: true },
    });
    if (!moderator?.isActive) return unauthorized();
    return { id: moderator.id, email: moderator.email, role: moderator.role, isDemo: moderator.isDemo === true };
  } catch (err) {
    console.error("Moderator auth lookup failed:", err);
    return internalError();
  }
}

/**
 * Wraps a route handler so it only runs for an active moderator (any role);
 * otherwise responds 401 before the handler runs.
 *
 *   export const GET = withModerator(async (request, ctx, moderator) => { ... });
 */
export function withModerator<Req extends Request, Ctx>(
  handler: (request: Req, ctx: Ctx, moderator: AuthenticatedModerator) => Promise<Response>,
) {
  return async (request: Req, ctx: Ctx): Promise<Response> => {
    const result = await authenticate(request);
    if (result instanceof Response) return result;
    return handler(request, ctx, result);
  };
}

/** Like withModerator, but an authenticated non-ADMIN gets 403. */
export function withAdmin<Req extends Request, Ctx>(
  handler: (request: Req, ctx: Ctx, admin: AuthenticatedModerator) => Promise<Response>,
) {
  return withModerator<Req, Ctx>(async (request, ctx, moderator) => {
    if (moderator.role !== "ADMIN") return forbidden("Administrator access required");
    return handler(request, ctx, moderator);
  });
}
