import { randomUUID } from "node:crypto";
import { signUploadToken, UPLOAD_TOKEN_TTL_SECONDS } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { createSignedUploadUrl } from "@/lib/storage";
import { EXTENSIONS } from "@/lib/uploads";
import { uploadSignRequestSchema } from "@/lib/validation";
import { apiSuccess, badRequest, internalError, readJson, validationError } from "@/lib/apiResponse";

// Files never pass through this API (Vercel functions reject bodies over
// ~4.5 MB). The browser PUTs the file straight to Supabase Storage using the
// signed URL, then submits the uploadToken with the report, which is when the
// file is checked, sanitized and attached.
export async function POST(request: Request) {
  const limited = await checkRateLimit("uploadSign", request);
  if (limited) return limited;

  const body = await readJson(request);
  if (!body.ok) return badRequest("Request body must be valid JSON");

  const parsed = uploadSignRequestSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const { mimeType, sizeBytes } = parsed.data;

  try {
    const jti = randomUUID();
    const path = `staging/${jti}.${EXTENSIONS[mimeType]}`;
    const { signedUrl } = await createSignedUploadUrl(path);
    const uploadToken = await signUploadToken({ jti, path, mimeType, sizeBytes });
    return apiSuccess({ uploadUrl: signedUrl, uploadToken, expiresIn: UPLOAD_TOKEN_TTL_SECONDS });
  } catch (err) {
    console.error("POST /api/uploads/sign failed:", err instanceof Error ? err.name : "unknown");
    return internalError();
  }
}
