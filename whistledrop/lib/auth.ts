import { SignJWT, jwtVerify } from "jose";
import type { ModeratorRole } from "@prisma/client";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, type UploadMimeType } from "@/lib/validation";

// Edge-compatible: only `jose` and Web Crypto. Route guards that also check the
// database live in lib/guards.ts.

const ALG = "HS256";
const ISSUER = "whistledrop";
const AUDIENCE = "whistledrop:moderator";
const EXPIRY = "12h";

// Upload tokens use a different audience, so one can never be accepted as a
// moderator token (or the other way round) even though both share JWT_SECRET.
const UPLOAD_AUDIENCE = "whistledrop:upload";
export const UPLOAD_TOKEN_TTL_SECONDS = 30 * 60;

export interface ModeratorTokenPayload {
  sub: string; // Moderator.id
  email: string;
  /** Informational only: guards authorize with the role currently in the database. */
  role: ModeratorRole;
}

export interface UploadTokenPayload {
  jti: string;
  /** Staging object path inside the evidence bucket. */
  path: string;
  mimeType: UploadMimeType;
  sizeBytes: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signModeratorToken(payload: ModeratorTokenPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

/** Returns the payload, or null if the token is missing, invalid, or expired. */
export async function verifyToken(token: string): Promise<ModeratorTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const { sub, email, role } = payload;
    if (typeof sub !== "string" || typeof email !== "string") return null;
    if (role !== "ADMIN" && role !== "MODERATOR") return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}

/**
 * Reads a Bearer token from the Authorization header and verifies it.
 * Route handlers should use `withModerator` / `withAdmin` from lib/guards.ts,
 * which also check the account in the database.
 */
export async function verifyModeratorToken(request: Request): Promise<ModeratorTokenPayload | null> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifyToken(match[1].trim());
}

export async function signUploadToken(payload: UploadTokenPayload): Promise<string> {
  return new SignJWT({ path: payload.path, mimeType: payload.mimeType, sizeBytes: payload.sizeBytes })
    .setProtectedHeader({ alg: ALG })
    .setJti(payload.jti)
    .setIssuer(ISSUER)
    .setAudience(UPLOAD_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${UPLOAD_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Returns the payload, or null if the token is invalid, expired, or its claims are out of bounds. */
export async function verifyUploadToken(token: string): Promise<UploadTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: UPLOAD_AUDIENCE,
    });
    const { jti, path, mimeType, sizeBytes } = payload;
    if (typeof jti !== "string" || typeof path !== "string" || !path.startsWith("staging/")) return null;
    if (!ALLOWED_UPLOAD_TYPES.includes(mimeType as UploadMimeType)) return null;
    if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_UPLOAD_BYTES) {
      return null;
    }
    return { jti, path, mimeType: mimeType as UploadMimeType, sizeBytes };
  } catch {
    return null;
  }
}
