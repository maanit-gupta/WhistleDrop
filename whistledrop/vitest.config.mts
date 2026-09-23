import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Why Vitest rather than Jest:
// - It runs this project's TypeScript and ESM directly (jose and Next's route
//   modules are ESM). Jest would need next/jest or an SWC/Babel transform plus
//   ESM workarounds before it could import a route handler.
// - Path aliases (@/...) are a single `resolve.alias` entry instead of a
//   moduleNameMapper that must be kept in sync with tsconfig.
// - `projects` lets the fast mocked unit tests and the real-database
//   integration tests share one config with different environments.
// - Route handlers are plain (Request) => Response functions, so no Next.js
//   test harness is needed; either runner could call them, Vitest just needs
//   no extra setup to do so.

const alias = {
  "@": fileURLToPath(new URL(".", import.meta.url)),
  "server-only": fileURLToPath(new URL("./tests/helpers/serverOnly.ts", import.meta.url)),
};
const JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
const IP_HASH_SECRET = "test-ip-hash-secret-at-least-32-characters";

// Integration tests only ever talk to this disposable database (see
// compose.test.yml and tests/integration/globalSetup.ts), never Supabase.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54329/whistledrop_test";

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/*.test.ts"],
          env: { JWT_SECRET, IP_HASH_SECRET },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.int.test.ts"],
          globalSetup: ["tests/integration/globalSetup.ts"],
          // Uploads re-encode images with sharp; allow for slower machines.
          testTimeout: 20_000,
          // One shared database, so files must not run concurrently.
          fileParallelism: false,
          env: {
            JWT_SECRET,
            IP_HASH_SECRET,
            TEST_DATABASE_URL,
            // Point the app's Prisma client (lib/db.ts) at the test database.
            DATABASE_URL: TEST_DATABASE_URL,
            DIRECT_URL: TEST_DATABASE_URL,
          },
        },
      },
    ],
  },
});
