// Creates (or updates) the private evidence bucket. Run once per Supabase
// project: npm run storage:setup (reads .env.local).
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "../lib/validation";

const BUCKET = "evidence"; // keep in sync with EVIDENCE_BUCKET in lib/storage.ts

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

  const storage = createClient(url, key, { auth: { persistSession: false } }).storage;
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
