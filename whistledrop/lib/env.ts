import { z } from "zod";

// Central validation for server-side environment variables. Values are read
// and checked on every call (not cached at import), so a missing or weak value
// fails loudly at the point of use, with the variable's name in the error.
// `npm run env:check` validates everything at once, e.g. before a deploy.
//
// Edge-compatible (no Node APIs), because lib/auth.ts uses it.

const secret = z.string().min(32, "must be at least 32 characters");

const RULES = {
  DATABASE_URL: z.url(),
  JWT_SECRET: secret,
  IP_HASH_SECRET: secret,
  CRON_SECRET: secret,
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "must be set"),
} as const;

export type ServerEnvName = keyof typeof RULES;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

function problem(name: ServerEnvName): string | null {
  const value = process.env[name];
  if (!value) return `${name} must be set`;
  const result = RULES[name].safeParse(value);
  return result.success ? null : `${name} ${result.error.issues[0].message}`;
}

/** Returns the validated value, or throws an EnvError naming the variable. */
export function requireEnv(name: ServerEnvName): string {
  const issue = problem(name);
  if (issue) throw new EnvError(issue);
  return process.env[name]!;
}

export function hasUpstashConfig(): boolean {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
  );
}

const demoModeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["", "true", "false"]));

/**
 * DEMO_MODE: "true" marks a public demo instance (banner, acknowledgement on
 * the report form, daily purge and sample reset in the cron). Unset or "false"
 * means a normal instance. Any other value throws an EnvError rather than
 * guessing, so a typo can't silently turn the demo safeguards off.
 */
export function isDemoMode(): boolean {
  const parsed = demoModeSchema.safeParse(process.env.DEMO_MODE ?? "");
  if (!parsed.success) throw new EnvError('DEMO_MODE must be "true" or "false"');
  return parsed.data === "true";
}

/** Every problem with the server environment; empty when all is well. */
export function validateServerEnv(): string[] {
  const problems = (Object.keys(RULES) as ServerEnvName[]).map(problem).filter((p): p is string => p !== null);
  if (!hasUpstashConfig()) problems.push("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  try {
    isDemoMode();
  } catch (err) {
    problems.push((err as Error).message);
  }
  return problems;
}
