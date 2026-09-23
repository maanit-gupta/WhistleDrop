import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvError, requireEnv, validateServerEnv } from "@/lib/env";

const STRONG = "x".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns a valid value", () => {
    vi.stubEnv("CRON_SECRET", STRONG);
    expect(requireEnv("CRON_SECRET")).toBe(STRONG);
  });

  it.each([
    ["missing", "", /CRON_SECRET must be set/],
    ["too short", "short", /CRON_SECRET must be at least 32 characters/],
  ])("throws an EnvError naming the variable when %s", (_label, value, message) => {
    vi.stubEnv("CRON_SECRET", value);
    expect(() => requireEnv("CRON_SECRET")).toThrow(EnvError);
    expect(() => requireEnv("CRON_SECRET")).toThrow(message);
  });

  it("rejects a SUPABASE_URL that isn't an http(s) URL", () => {
    vi.stubEnv("SUPABASE_URL", "ftp://example.com");
    expect(() => requireEnv("SUPABASE_URL")).toThrow(/SUPABASE_URL/);
  });
});

describe("validateServerEnv", () => {
  it("lists every problem, including CRON_SECRET and Upstash", () => {
    for (const name of ["DATABASE_URL", "JWT_SECRET", "IP_HASH_SECRET", "CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
      vi.stubEnv(name, "");
    }
    const problems = validateServerEnv().join("\n");
    for (const name of ["DATABASE_URL", "JWT_SECRET", "IP_HASH_SECRET", "CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "UPSTASH_REDIS_REST_URL"]) {
      expect(problems).toContain(name);
    }
  });

  it("is empty when everything is set", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
    for (const name of ["JWT_SECRET", "IP_HASH_SECRET", "CRON_SECRET"]) vi.stubEnv(name, STRONG);
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-value-long-enough");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://x.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    expect(validateServerEnv()).toEqual([]);
  });
});
