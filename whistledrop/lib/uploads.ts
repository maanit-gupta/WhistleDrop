import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { verifyUploadToken, type UploadTokenPayload } from "@/lib/auth";
import { StorageObjectNotFoundError, downloadObject, removeObjects, uploadObject } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, type UploadMimeType } from "@/lib/validation";

export const EXTENSIONS: Record<UploadMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Refuse to decode images bigger than ~50 megapixels: a small, highly
// compressed file could otherwise expand into gigabytes of pixels.
const MAX_INPUT_PIXELS = 50_000_000;

/** A client-caused upload problem; maps to a 4xx response. */
export class UploadError extends Error {
  constructor(
    readonly code: "INVALID_UPLOAD_TOKEN" | "INVALID_UPLOAD" | "UPLOAD_TOKEN_USED",
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Identifies the real file type from its leading bytes, ignoring anything the client claimed. */
export function sniffMimeType(bytes: Buffer): UploadMimeType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}

/**
 * Re-encodes an image so no metadata survives: EXIF (including GPS and device
 * model), XMP, IPTC and comments. It auto-rotates first so the picture keeps
 * its orientation once the EXIF orientation tag is gone. sharp writes no
 * metadata unless asked to, so the output only has pixels (converted to sRGB).
 */
export async function stripImageMetadata(bytes: Buffer, mimeType: Exclude<UploadMimeType, "application/pdf">) {
  const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
  switch (mimeType) {
    case "image/jpeg":
      return image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    case "image/png":
      return image.png({ compressionLevel: 9 }).toBuffer();
    case "image/webp":
      return image.webp({ quality: 90 }).toBuffer();
  }
}

/** Checks one uploaded file and returns the bytes to store (images re-encoded, PDFs unchanged). */
export async function validateAndSanitize(token: UploadTokenPayload, bytes: Buffer): Promise<Buffer> {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError("INVALID_UPLOAD", "File exceeds the 10 MB limit");
  if (bytes.length !== token.sizeBytes) {
    throw new UploadError("INVALID_UPLOAD", "Uploaded file size does not match the declared size");
  }
  if (sniffMimeType(bytes) !== token.mimeType) {
    throw new UploadError("INVALID_UPLOAD", "File contents do not match the declared type");
  }
  if (token.mimeType === "application/pdf") return bytes; // Validated only: PDF metadata is NOT stripped.

  try {
    return await stripImageMetadata(bytes, token.mimeType);
  } catch {
    throw new UploadError("INVALID_UPLOAD", "Image could not be processed");
  }
}

export async function verifyUploadTokens(tokens: string[]): Promise<UploadTokenPayload[]> {
  const payloads = await Promise.all(tokens.map(verifyUploadToken));
  if (payloads.some((p) => p === null)) {
    throw new UploadError("INVALID_UPLOAD_TOKEN", "Upload token is invalid or expired");
  }
  const verified = payloads as UploadTokenPayload[];
  if (new Set(verified.map((p) => p.jti)).size !== verified.length) {
    throw new UploadError("UPLOAD_TOKEN_USED", "Each upload token may only be used once");
  }
  return verified;
}

/** A new id in Prisma's cuid shape, needed before insert so files can go under reports/<id>/. */
export function newId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  return "c" + Array.from(randomBytes(24), (b) => alphabet[b % 36]).join("");
}

export interface StoredAttachment {
  id: string;
  storagePath: string;
  mimeType: UploadMimeType;
  sizeBytes: number;
}

/**
 * Downloads each staged upload, validates and sanitizes it, and stores the
 * result under reports/<reportId>/. All or nothing: if any file fails, files
 * already stored by this call are deleted before the error is rethrown.
 * Staging objects are left alone, so the caller can delete them only once the
 * database write has committed.
 */
export async function storeAttachments(reportId: string, tokens: UploadTokenPayload[]): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = [];
  try {
    for (const token of tokens) {
      let bytes: Buffer;
      try {
        bytes = await downloadObject(token.path);
      } catch (err) {
        if (err instanceof StorageObjectNotFoundError) {
          throw new UploadError("INVALID_UPLOAD", "No uploaded file found for this upload token");
        }
        throw err;
      }
      const clean = await validateAndSanitize(token, bytes);
      const id = newId();
      const storagePath = `reports/${reportId}/${id}.${EXTENSIONS[token.mimeType]}`;
      await uploadObject(storagePath, clean, token.mimeType);
      stored.push({ id, storagePath, mimeType: token.mimeType, sizeBytes: clean.length });
    }
    return stored;
  } catch (err) {
    await discardStoredAttachments(stored);
    throw err;
  }
}

/** Best-effort cleanup of files written by storeAttachments. */
export async function discardStoredAttachments(stored: Pick<StoredAttachment, "storagePath">[]) {
  try {
    await removeObjects(stored.map((a) => a.storagePath));
  } catch (err) {
    console.error("Failed to remove attachments after a rolled-back submission:", err instanceof Error ? err.name : "unknown");
  }
}
