// Validates every server environment variable: npm run env:check
// (reads .env.local). Run it before deploying or in CI against the target env.
import { validateServerEnv } from "../lib/env";

const problems = validateServerEnv();
if (problems.length > 0) {
  console.error(`Environment is not valid:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("Environment OK");
