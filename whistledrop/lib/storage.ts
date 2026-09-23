import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// Server-only Supabase Storage access using the service role key, which
// bypasses Storage RLS. `server-only` makes the build fail if this module is
// ever imported into client code, so the key can't reach a browser bundle.
//
// The bucket is private: nothing in it has a public URL. Browsers only get
// short-lived signed URLs (upload: from POST /api/uploads/sign; download: 60 s,
// moderators only).

export const EVIDENCE_BUCKET = "evidence";

let client: SupabaseClient | null = null;

function bucket() {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client.storage.from(EVIDENCE_BUCKET);
}

export class StorageObjectNotFoundError extends Error {
  constructor(path: string) {
    super(`Storage object not found: ${path}`);
    this.name = "StorageObjectNotFoundError";
  }
}

function fail(operation: string, error: { message: string }): never {
  throw new Error(`Storage ${operation} failed: ${error.message}`);
}

/** Signed URL the browser can PUT one file to. The path can't be overwritten (upsert off). */
export async function createSignedUploadUrl(path: string): Promise<{ signedUrl: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
  if (error) fail("createSignedUploadUrl", error);
  return { signedUrl: data.signedUrl };
}

export async function downloadObject(path: string): Promise<Buffer> {
  const { data, error } = await bucket().download(path);
  if (error) {
    const status = (error as { status?: number }).status;
    const code = (error as { code?: string }).code;
    if (status === 404 || status === 400 || code === "NoSuchKey") throw new StorageObjectNotFoundError(path);
    fail("download", error);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadObject(path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await bucket().upload(path, body, { contentType, upsert: false });
  if (error) fail("upload", error);
}

/** Deletes objects; paths that don't exist are ignored. */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) fail("remove", error);
}

/** Full paths of every object directly under `prefix` (e.g. "reports/<id>"). */
export async function listObjects(prefix: string): Promise<string[]> {
  const { data, error } = await bucket().list(prefix, { limit: 1000 });
  if (error) fail("list", error);
  return data.filter((o) => o.id !== null).map((o) => `${prefix}/${o.name}`);
}

/** Every object directly under `prefix`, with its creation time (paginated). */
export async function listObjectsWithCreatedAt(prefix: string): Promise<{ path: string; createdAt: Date }[]> {
  const PAGE = 1000;
  const out: { path: string; createdAt: Date }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket().list(prefix, { limit: PAGE, offset, sortBy: { column: "created_at", order: "asc" } });
    if (error) fail("list", error);
    for (const o of data) {
      // Folder placeholders have no id or timestamp.
      if (o.id !== null && o.created_at) out.push({ path: `${prefix}/${o.name}`, createdAt: new Date(o.created_at) });
    }
    if (data.length < PAGE) return out;
  }
}

/** Time-limited download link (served with Content-Disposition: attachment). */
export async function createSignedDownloadUrl(path: string, expiresInSeconds: number): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, expiresInSeconds, { download: true });
  if (error) fail("createSignedUrl", error);
  return data.signedUrl;
}
