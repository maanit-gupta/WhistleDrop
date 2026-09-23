import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Upstash backend with @upstash/ratelimit and @upstash/redis mocked, so the
// production code path (sliding window, 429 + Retry-After, hashed keys) runs
// without a real Redis.
const upstash = vi.hoisted(() => ({
  constructed: [] as Record<string, unknown>[],
  limit: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = (tokens: number, window: string) => ({ algorithm: "slidingWindow", tokens, window });
    constructor(config: Record<string, unknown>) {
      upstash.constructed.push(config);
    }
    limit = upstash.limit;
  }
  return { Ratelimit };
});
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ fake: "redis" }) } }));

const IP = "203.0.113.42";
const request = (ip = IP) => new Request("http://localhost/api/reports", { headers: { "x-forwarded-for": ip } });

async function loadWithUpstash() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  return import("@/lib/rateLimit");
}

beforeEach(() => {
  upstash.constructed = [];
  upstash.limit.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Upstash rate limiting", () => {
  it("returns 429 with Retry-After when Upstash reports the limit exceeded", async () => {
    const { checkRateLimit } = await loadWithUpstash();
    upstash.limit.mockResolvedValue({ success: false, reset: Date.now() + 42_000, limit: 30, remaining: 0 });

    const res = await checkRateLimit("lookup", request());
    expect(res!.status).toBe(429);
    expect(res!.headers.get("retry-after")).toBe("42");
    expect(res!.headers.get("cache-control")).toBe("no-store");
    expect(await res!.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
    });
  });

  it("lets the request through when Upstash allows it", async () => {
    const { checkRateLimit } = await loadWithUpstash();
    upstash.limit.mockResolvedValue({ success: true, reset: Date.now() + 1000, limit: 30, remaining: 29 });
    expect(await checkRateLimit("submit", request())).toBeNull();
  });

  it("configures one sliding-window limiter per endpoint, with analytics off", async () => {
    const { checkRateLimit, RATE_LIMITS } = await loadWithUpstash();
    upstash.limit.mockResolvedValue({ success: true, reset: 0 });
    await checkRateLimit("login", request());

    expect(upstash.constructed.map((c) => c.prefix)).toEqual(
      Object.keys(RATE_LIMITS).map((name) => `whistledrop:rl:${name}`),
    );
    for (const config of upstash.constructed) expect(config).toMatchObject({ analytics: false, redis: { fake: "redis" } });
    expect(upstash.constructed.find((c) => c.prefix === "whistledrop:rl:login")!.limiter).toEqual({
      algorithm: "slidingWindow",
      tokens: RATE_LIMITS.login.limit,
      window: `${RATE_LIMITS.login.windowSeconds} s`,
    });
  });

  it("sends Upstash an HMAC of the IP, never the IP itself", async () => {
    const { checkRateLimit, hashClientIp } = await loadWithUpstash();
    upstash.limit.mockResolvedValue({ success: true, reset: 0 });
    await checkRateLimit("uploadSign", request());

    const [key] = upstash.limit.mock.calls[0];
    expect(key).toBe(hashClientIp(IP));
    expect(key).not.toContain(IP);
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/); // base64url SHA-256
  });

  it("returns 503 RATE_LIMITER_UNAVAILABLE if Upstash isn't configured in production, without logging the IP", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    const { checkRateLimit } = await import("@/lib/rateLimit");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await checkRateLimit("lookup", request());
    expect(res!.status).toBe(503);
    expect(await res!.json()).toEqual({
      error: { code: "RATE_LIMITER_UNAVAILABLE", message: "Service temporarily unavailable" },
    });
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain(IP);
    errorLog.mockRestore();
  });

  it("fails closed with a generic 500 when Upstash rejects the request", async () => {
    const { checkRateLimit } = await loadWithUpstash();
    upstash.limit.mockRejectedValue(new Error("WRONGPASS invalid token"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await checkRateLimit("submit", request());
    expect(res!.status).toBe(500);
    expect((await res!.json()).error.code).toBe("INTERNAL_ERROR");
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain(IP);
    errorLog.mockRestore();
  });
});

describe("IP hashing", () => {
  it("is stable within a UTC day and rotates at UTC midnight", async () => {
    const { hashClientIp } = await import("@/lib/rateLimit");
    const morning = hashClientIp(IP, new Date("2026-09-23T00:00:01Z"));
    const evening = hashClientIp(IP, new Date("2026-09-23T23:59:59Z"));
    const nextDay = hashClientIp(IP, new Date("2026-09-24T00:00:00Z"));
    expect(morning).toBe(evening);
    expect(nextDay).not.toBe(morning);
  });

  it("depends on IP_HASH_SECRET, so hashes can't be recomputed without it", async () => {
    const { hashClientIp } = await import("@/lib/rateLimit");
    const day = new Date("2026-09-23T12:00:00Z");
    const a = hashClientIp(IP, day);
    vi.stubEnv("IP_HASH_SECRET", "a-completely-different-secret-value-xyz");
    expect(hashClientIp(IP, day)).not.toBe(a);
  });

  it("gives different addresses different keys", async () => {
    const { hashClientIp } = await import("@/lib/rateLimit");
    expect(hashClientIp("203.0.113.1")).not.toBe(hashClientIp("203.0.113.2"));
  });

  it("refuses to run without a strong IP_HASH_SECRET", async () => {
    const { hashClientIp } = await import("@/lib/rateLimit");
    vi.stubEnv("IP_HASH_SECRET", "short");
    expect(() => hashClientIp(IP)).toThrow(/IP_HASH_SECRET/);
  });
});

describe("in-memory fallback (NODE_ENV=test)", () => {
  it("is a sliding window: capacity frees up as old requests age out", async () => {
    vi.resetModules();
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rateLimit");
    const { limit, windowSeconds } = RATE_LIMITS.login;
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();

    for (let i = 0; i < limit; i++) {
      vi.setSystemTime(start + i * 1000);
      expect(await checkRateLimit("login", request())).toBeNull();
    }
    const blocked = await checkRateLimit("login", request());
    expect(blocked!.status).toBe(429);
    // The oldest request (at `start`) ages out after windowSeconds; only then is there room again.
    expect(Number(blocked!.headers.get("retry-after"))).toBe(windowSeconds - (limit - 1));

    vi.setSystemTime(start + windowSeconds * 1000 + 1);
    expect(await checkRateLimit("login", request())).toBeNull();
    expect((await checkRateLimit("login", request()))!.status).toBe(429);
  });
});
