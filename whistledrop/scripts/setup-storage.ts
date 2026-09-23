// Creates (or updates) the private evidence bucket. Run once per Supabase
// project: npm run storage:setup (reads .env.local). Runs with Node's
// "react-server" condition because lib/validation.ts is `server-only`.
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "../lib/validation";
import { requireEnv } from "../lib/env";

const BUCKET = "evidence"; // keep in sync with EVIDENCE_BUCKET in lib/storage.ts

async function main() {
  const storage = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  }).storage;
  // Storage itself also enforces the size cap and type allowlist on upload.
  const options = { public: false, fileSizeLimit: MAX_UPLOAD_BYTES, allowedMimeTypes: [...ALLOWED_UPLOAD_TYPES] };

  const { data: existing } = await storage.getBucket(BUCKET);
  const { error } = existing
    ? await storage.updateBucket(BUCKET, options)
    : await storage.createBucket(BUCKET, options);
  if (error) throw error;

  const { data } = await storage.getBucket(BUCKET);
  console.log(`Bucket "${BUCKET}" ${existing ? "updated" : "created"}: public=${data?.public}, limit=${data?.file_size_limit} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
