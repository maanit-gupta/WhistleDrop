import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { apiError, internalError, rateLimited } from "@/lib/apiResponse";
import { hasUpstashConfig, requireEnv } from "@/lib/env";

// PRIVACY: raw IPs are never stored, not even here. The rate-limit key is
// HMAC-SHA256(ip) keyed with IP_HASH_SECRET plus the current UTC date, so the
// same address hashes differently every day and yesterday's keys can't be
// linked to today's. The hash only ever exists in Redis (the sliding-window keys
// expire after about two windows); it is never written to Postgres or logged.

export const RATE_LIMITS = {
  /** GET /api/reports/:caseCode: enough for a reporter checking their case, too few to guess codes. */
  lookup: { limit: 30, windowSeconds: 15 * 60 },
  /** POST /api/reports */
  submit: { limit: 10, windowSeconds: 60 * 60 },
  /** POST /api/uploads/sign: up to 3 files per report. */
  uploadSign: { limit: 30, windowSeconds: 60 * 60 },
  /** POST /api/mod/login: slows password guessing. */
  login: { limit: 10, windowSeconds: 15 * 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

interface LimitResult {
  success: boolean;
  /** Epoch ms when the request would be allowed again. */
  reset: number;
}
interface Limiter {
  limit(key: string): Promise<LimitResult>;
}

export function clientIp(request: Request): string {
  // First hop of X-Forwarded-For is the client as seen by the platform proxy
  // (e.g. Vercel). Only trust this header when running behind such a proxy.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** HMAC-SHA256 of the IP, keyed with IP_HASH_SECRET + the UTC date (daily-rotating salt). */
export function hashClientIp(ip: string, now = new Date()): string {
  const secret = requireEnv("IP_HASH_SECRET");
  const utcDate = now.toISOString().slice(0, 10);
  return createHmac("sha256", `${secret}:${utcDate}`).update(ip).digest("base64url");
}

/** In-memory sliding window (timestamp log). Test-only fallback: per process, lost on restart. */
function createMemoryLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const limiter: Limiter & { reset(): void } = {
    async limit(key) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { success: false, reset: recent[0] + windowMs };
      }
      recent.push(now);
      hits.set(key, recent);
      return { success: true, reset: recent[0] + windowMs };
    },
    reset() {
      hits.clear();
    },
  };
  return limiter;
}

/** Upstash is required but not configured (production without credentials). */
class RateLimiterUnavailableError extends Error {
  constructor() {
    super("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set outside tests and local development");
    this.name = "RateLimiterUnavailableError";
  }
}

type Backend = { kind: "upstash" | "memory"; limiters: Record<RateLimitName, Limiter> };

function forEachLimit(make: (rule: (typeof RATE_LIMITS)[RateLimitName], name: RateLimitName) => Limiter) {
  const out = {} as Record<RateLimitName, Limiter>;
  for (const name of Object.keys(RATE_LIMITS) as RateLimitName[]) out[name] = make(RATE_LIMITS[name], name);
  return out;
}

let backend: Backend | null = null;
const memoryLimiters: { reset(): void }[] = [];

function getBackend(): Backend {
  if (backend) return backend;

  const hasUpstash = hasUpstashConfig();
  const env = process.env.NODE_ENV;

  if (env === "test" || (env === "development" && !hasUpstash)) {
    if (env === "development") {
      console.warn("[rateLimit] Upstash Redis not configured; using the in-memory limiter (development only).");
    }
    const limiters = forEachLimit(({ limit, windowSeconds }) => {
      const limiter = createMemoryLimiter(limit, windowSeconds * 1000);
      memoryLimiters.push(limiter);
      return limiter;
    });
    return (backend = { kind: "memory", limiters });
  }

  if (!hasUpstash) throw new RateLimiterUnavailableError();

  const redis = Redis.fromEnv();
  const limiters = forEachLimit(
    ({ limit, windowSeconds }, name) =>
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
        prefix: `whistledrop:rl:${name}`,
        // Analytics would store identifiers (our IP hashes) in extra Redis keys.
        analytics: false,
        // If Redis doesn't answer in time the request is allowed: an outage
        // must not stop people from reporting.
        timeout: 3000,
      }),
  );
  return (backend = { kind: "upstash", limiters });
}

/**
 * Applies the named limit to the caller's IP. Returns a 429 response (with
 * Retry-After) when the limit is exceeded, or null when the request may proceed.
 */
export async function checkRateLimit(name: RateLimitName, request: Request): Promise<Response | null> {
  let result: LimitResult;
  try {
    result = await getBackend().limiters[name].limit(hashClientIp(clientIp(request)));
  } catch (err) {
    // Errors fail closed; a slow Redis fails open via `timeout` above. Never
    // log the key or IP.
    console.error(`[rateLimit] ${name} check failed:`, err instanceof Error ? err.message : "unknown");
    if (err instanceof RateLimiterUnavailableError) {
      return apiError("RATE_LIMITER_UNAVAILABLE", "Service temporarily unavailable", 503);
    }
    return internalError();
  }
  if (result.success) return null;
  return rateLimited(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)));
}

/** Clears the in-memory limiters. Tests only. */
export function resetRateLimitsForTests() {
  for (const limiter of memoryLimiters) limiter.reset();
}
