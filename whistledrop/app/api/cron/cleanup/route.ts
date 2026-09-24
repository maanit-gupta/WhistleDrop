import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { UPLOAD_TOKEN_TTL_SECONDS } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { listObjectsWithCreatedAt, removeObjects } from "@/lib/storage";
import { reassertDemoAccounts } from "@/lib/demo";
import { apiSuccess, internalError, unauthorized } from "@/lib/apiResponse";

// Daily housekeeping, scheduled in vercel.json. Vercel Cron calls this with
// `Authorization: Bearer $CRON_SECRET`.
//
// - Staged uploads older than 1 hour can no longer be attached (upload tokens
//   expire after 30 minutes), so they are deleted.
// - ConsumedUploadToken rows only matter while the token could still be
//   presented; once older than the token lifetime they are deleted.
// - The public demo accounts are made active again with their original roles
//   (the API already refuses to change them; this is the backstop).

const STAGING_MAX_AGE_MS = 60 * 60 * 1000;
const REMOVE_BATCH = 100;

/** Constant-time comparison; hashing first makes both inputs the same length. */
function secretMatches(given: string, expected: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export async function GET(request: Request) {
  let expected: string;
  try {
    expected = requireEnv("CRON_SECRET");
  } catch (err) {
    // Fail closed: without a configured secret nobody may run the job.
    console.error("Cron cleanup misconfigured:", err instanceof Error ? err.message : "unknown");
    return internalError();
  }

  const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match || !secretMatches(match[1].trim(), expected)) return unauthorized();

  try {
    const now = Date.now();

    const stale = (await listObjectsWithCreatedAt("staging"))
      .filter((o) => o.createdAt.getTime() < now - STAGING_MAX_AGE_MS)
      .map((o) => o.path);
    for (let i = 0; i < stale.length; i += REMOVE_BATCH) await removeObjects(stale.slice(i, i + REMOVE_BATCH));

    const { count } = await prisma.consumedUploadToken.deleteMany({
      where: { consumedAt: { lt: new Date(now - UPLOAD_TOKEN_TTL_SECONDS * 1000) } },
    });

    const demoAccountsReset = await reassertDemoAccounts();

    return apiSuccess({ deletedStagingObjects: stale.length, deletedConsumedUploadTokens: count, demoAccountsReset });
  } catch (err) {
    console.error("Cron cleanup failed:", err instanceof Error ? err.message : "unknown");
    return internalError();
  }
}
