// Copies Swagger UI's assets from node_modules into public/ so /api-docs is
// served entirely from our own origin (no third-party CDN). Runs on install.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = dirname(require.resolve("swagger-ui-dist/package.json"));
const dest = join(process.cwd(), "public", "api-docs", "vendor");

mkdirSync(dest, { recursive: true });
for (const file of ["swagger-ui.css", "swagger-ui-bundle.js"]) copyFileSync(join(src, file), join(dest, file));
console.log(`Copied Swagger UI assets to ${dest}`);
