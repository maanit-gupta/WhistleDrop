import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/**
 * Test database strategy: a dedicated, disposable Postgres (compose.test.yml).
 *
 * Why not wrap each test in a rolled-back transaction? The code under test is
 * the real route handlers, which use the shared client from lib/db.ts and open
 * their own prisma.$transaction. Prisma can't nest interactive transactions,
 * so an outer "rollback everything" transaction would mean swapping in a
 * different client and no longer testing the real transaction behaviour
 * (including concurrent updates, which need separate connections).
 *
 * Why not a Supabase branch or schema? It costs money, and each round trip
 * from a dev machine was measured at ~1.5 s, which makes a suite slow and
 * flaky. Plain Postgres runs the same migrations, including RLS.
 *
 * So: the container keeps its data in tmpfs and starts empty. Before the run,
 * `prisma migrate deploy` applies prisma/migrations (which also checks they
 * apply cleanly; it's a no-op if they already are); before each test, the
 * tables are truncated (see db.ts in this folder). To rebuild the schema from
 * scratch, restart the container: npm run test:db:down && npm run test:db:up.
 */
export default function setup(project: TestProject) {
  // Global setup runs in the main process, where the project's `env` isn't applied.
  const url = project.config.env.TEST_DATABASE_URL;
  assertSafeTestDatabase(url);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}

export function assertSafeTestDatabase(url: string | undefined): asserts url is string {
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const { hostname, pathname } = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1", "postgres-test"].includes(hostname);
  if (!local || !pathname.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against ${hostname}${pathname}: ` +
        "TEST_DATABASE_URL must point at a local database whose name ends in _test.",
    );
  }
}
