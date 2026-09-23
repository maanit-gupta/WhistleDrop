/**
 * In-memory replacement for lib/storage.ts (Supabase Storage), used with
 *   vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));
 * It exports the same functions, plus helpers to inspect objects and inject
 * failures. Behaviour mirrors the real bucket: uploads never overwrite,
 * removing a missing path is a no-op, downloads of missing paths throw.
 */
export const EVIDENCE_BUCKET = "evidence";

export const objects = new Map<string, { body: Buffer; contentType: string; createdAt?: Date }>();
export const calls = {
  signedUploads: [] as string[],
  signedDownloads: [] as { path: string; expiresIn: number }[],
};
export const failures = {
  /** Return true to make uploadObject(path) throw. */
  upload: null as null | ((path: string) => boolean),
  remove: false,
};

export class StorageObjectNotFoundError extends Error {
  constructor(path: string) {
    super(`Storage object not found: ${path}`);
    this.name = "StorageObjectNotFoundError";
  }
}

export function resetFakeStorage() {
  objects.clear();
  calls.signedUploads = [];
  calls.signedDownloads = [];
  failures.upload = null;
  failures.remove = false;
}

/** What the browser does with the signed upload URL. */
export function simulateBrowserUpload(
  path: string,
  body: Buffer,
  contentType = "application/octet-stream",
  createdAt = new Date(),
) {
  objects.set(path, { body, contentType, createdAt });
}

export const pathsUnder = (prefix: string) => [...objects.keys()].filter((p) => p.startsWith(prefix)).sort();

export async function createSignedUploadUrl(path: string) {
  calls.signedUploads.push(path);
  return { signedUrl: `https://storage.test/object/upload/sign/${EVIDENCE_BUCKET}/${path}?token=signed` };
}

export async function downloadObject(path: string): Promise<Buffer> {
  const object = objects.get(path);
  if (!object) throw new StorageObjectNotFoundError(path);
  return Buffer.from(object.body);
}

export async function uploadObject(path: string, body: Buffer, contentType: string) {
  if (failures.upload?.(path)) throw new Error("Storage upload failed: simulated outage");
  if (objects.has(path)) throw new Error("Storage upload failed: The resource already exists");
  objects.set(path, { body: Buffer.from(body), contentType, createdAt: new Date() });
}

export async function removeObjects(paths: string[]) {
  if (paths.length === 0) return;
  if (failures.remove) throw new Error("Storage remove failed: simulated outage");
  for (const path of paths) objects.delete(path);
}

export async function listObjects(prefix: string) {
  return [...objects.keys()].filter((p) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes("/"));
}

export async function listObjectsWithCreatedAt(prefix: string) {
  const paths = await listObjects(prefix);
  return paths.map((path) => ({ path, createdAt: objects.get(path)!.createdAt ?? new Date() }));
}

export async function createSignedDownloadUrl(path: string, expiresInSeconds: number) {
  if (!objects.has(path)) throw new Error("Storage createSignedUrl failed: Object not found");
  calls.signedDownloads.push({ path, expiresIn: expiresInSeconds });
  return `https://storage.test/object/sign/${EVIDENCE_BUCKET}/${path}?token=signed&expires=${expiresInSeconds}`;
}
