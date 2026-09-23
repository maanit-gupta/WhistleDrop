import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signModeratorToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { moderatorLoginSchema } from "@/lib/validation";
import { apiError, apiSuccess, badRequest, internalError, readJson, validationError } from "@/lib/apiResponse";

// Compared against when the email is unknown, so response time doesn't reveal
// which emails belong to moderators. Hash of a random, discarded value.
const DUMMY_HASH = "$2b$12$gK2Ip86wo7.A3REpGNgK3eGo9hG47hA2BR5CKhIHl7MsLwCR26eL2";

const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export async function POST(request: Request) {
  const limited = await checkRateLimit("login", request);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = moderatorLoginSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { email, password } = parsed.data;

  try {
    const moderator = await prisma.moderator.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true, passwordHash: true },
    });
    const passwordOk = await bcrypt.compare(password, moderator?.passwordHash ?? DUMMY_HASH);
    // Deactivated accounts get the same generic answer as a wrong password.
    if (!moderator || !passwordOk || !moderator.isActive) {
      return apiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const token = await signModeratorToken({ sub: moderator.id, email: moderator.email, role: moderator.role });
    return apiSuccess({ token, tokenType: "Bearer", expiresIn: TOKEN_TTL_SECONDS });
  } catch (err) {
    console.error("POST /api/mod/login failed:", err);
    return internalError();
  }
}
