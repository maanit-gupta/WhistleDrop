import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { TestProject } from "vitest/node";

/**
 * Starts the production build with `next start` for tests that need real
 * Next.js rendering (e.g. CSP nonces on Next's own scripts). Requires a prior
 * `next build`; `npm run test:e2e` runs both. No database is needed: the pages
 * and endpoints exercised here don't query it.
 */
export default async function setup(project: TestProject) {
  if (!existsSync(".next/BUILD_ID")) throw new Error("No production build found: run `next build` first (npm run test:e2e)");

  const port = project.config.env.E2E_PORT ?? "3481";
  const baseUrl = project.config.env.E2E_BASE_URL;
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", port, "-H", "127.0.0.1"], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "production" },
  });

  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`${baseUrl}/api/openapi`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      process.kill(-server.pid!, "SIGTERM");
      throw new Error(`next start did not come up on ${baseUrl}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return () => {
    process.kill(-server.pid!, "SIGTERM"); // the whole process group (npx + next)
  };
}
