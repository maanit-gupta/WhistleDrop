import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { TestProject } from "vitest/node";

/**
 * Starts the production build with `next start` for tests that need real
 * Next.js rendering (e.g. CSP nonces on Next's own scripts). Requires a prior
 * `next build`; `npm run test:e2e` runs both. No database is needed: the pages
 * and endpoints exercised here don't query it (the report form's submission is
 * intercepted in the browser).
 */
/** Starts `next start` on `port` and waits until it answers. Returns a stop function. */
async function startServer(port: string, env: Record<string, string>) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", port, "-H", "127.0.0.1"], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "production", ...env },
  });
  const stop = () => process.kill(-server.pid!, "SIGTERM"); // the whole process group (npx + next)

  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`${baseUrl}/api/openapi`)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      stop();
      throw new Error(`next start did not come up on ${baseUrl}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return stop;
}

/**
 * Two servers from the same build: a normal instance (DEMO_MODE=false) and a
 * public demo instance (DEMO_MODE=true), so the demo safeguards can be checked
 * on and off. DEMO_MODE is read at request time, so no second build is needed.
 */
export default async function setup(project: TestProject) {
  if (!existsSync(".next/BUILD_ID")) throw new Error("No production build found: run `next build` first (npm run test:e2e)");

  const stops = [
    await startServer(project.config.env.E2E_PORT ?? "3481", { DEMO_MODE: "false" }),
    await startServer(project.config.env.E2E_DEMO_PORT ?? "3482", { DEMO_MODE: "true" }),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
