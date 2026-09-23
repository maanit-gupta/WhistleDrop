import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { signModeratorToken, signUploadToken } from "@/lib/auth";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import { MAX_UPLOAD_BYTES } from "@/lib/validation";
import { calls, failures, objects, pathsUnder, resetFakeStorage } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";
import { api, createAccount, imageWithExif, tinyPdf, uploadFile, validReport } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  resetFakeStorage();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const submitWith = (tokens: string[]) => api.submit({ ...validReport, attachments: tokens });

async function expectNothingSaved() {
  expect(await prisma.report.count()).toBe(0);
  expect(await prisma.attachment.count()).toBe(0);
  expect(await prisma.consumedUploadToken.count()).toBe(0);
  expect(pathsUnder("reports/")).toEqual([]);
}

async function storedAttachments() {
  const rows = await prisma.attachment.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({ row, body: objects.get(row.storagePath)?.body }));
}

describe("POST /api/uploads/sign", () => {
  it("returns a signed upload URL for a staging path and a token describing the declared file", async () => {
    const res = await api.sign({ mimeType: "image/png", sizeBytes: 1234 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ uploadUrl: expect.stringContaining("/staging/"), uploadToken: expect.any(String), expiresIn: 1800 });

    const claims = JSON.parse(Buffer.from(body.uploadToken.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ mimeType: "image/png", sizeBytes: 1234, aud: "whistledrop:upload" });
    expect(claims.path).toMatch(/^staging\/[0-9a-f-]{36}\.png$/);
    expect(calls.signedUploads).toEqual([claims.path]);
  });

  it.each([
    ["an unsupported type", { mimeType: "image/gif", sizeBytes: 100 }],
    ["an executable", { mimeType: "application/x-msdownload", sizeBytes: 100 }],
    ["a file over 10 MB", { mimeType: "application/pdf", sizeBytes: MAX_UPLOAD_BYTES + 1 }],
    ["an empty file", { mimeType: "image/png", sizeBytes: 0 }],
  ])("rejects %s with 400 without creating an upload URL", async (_label, body) => {
    const res = await api.sign(body);
    expect(res.status).toBe(400);
    expect(calls.signedUploads).toEqual([]);
  });
});

describe("submitting a report with attachments", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "re-encodes a %s, stripping all EXIF (GPS, device model) while keeping its orientation",
    async (format) => {
      const original = await imageWithExif(format);
      expect((await sharp(original).metadata()).exif).toBeDefined();
      const { uploadToken, stagingPath } = await uploadFile(original, `image/${format}`);

      const res = await submitWith([uploadToken]);
      expect(res.status).toBe(201);
      expect(Object.keys(await res.json())).toEqual(["caseCode"]);

      const [{ row, body }] = await storedAttachments();
      const report = await prisma.report.findFirstOrThrow();
      expect(row.storagePath).toMatch(new RegExp(`^reports/${report.id}/c[a-z0-9]{24}\\.(jpg|png|webp)$`));
      expect(row).toMatchObject({ mimeType: `image/${format}`, sizeBytes: body!.length });

      const meta = await sharp(body!).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(body!.toString("latin1")).not.toContain("SECRET-DEVICE");
      // Auto-rotated: the 40x20 image tagged "rotate 90°" is now stored as 20x40.
      expect([meta.width, meta.height]).toEqual([20, 40]);

      expect(objects.has(stagingPath)).toBe(false);
    },
  );

  it("stores a PDF unchanged (validated, not re-encoded)", async () => {
    const pdf = tinyPdf();
    const { uploadToken } = await uploadFile(pdf, "application/pdf");
    expect((await submitWith([uploadToken])).status).toBe(201);

    const [{ row, body }] = await storedAttachments();
    expect(row.mimeType).toBe("application/pdf");
    expect(body!.equals(pdf)).toBe(true);
  });

  it("accepts up to three files and rejects a fourth", async () => {
    const tokens = [];
    for (let i = 0; i < 4; i++) tokens.push((await uploadFile(tinyPdf(), "application/pdf")).uploadToken);

    expect((await submitWith(tokens)).status).toBe(400);
    await expectNothingSaved();
    expect((await submitWith(tokens.slice(0, 3))).status).toBe(201);
    expect(await prisma.attachment.count()).toBe(3);
  });
});

describe("upload validation", () => {
  it("rejects a file whose bytes don't match the declared type (magic-byte mismatch)", async () => {
    const jpeg = await imageWithExif("jpeg");
    const { uploadToken } = await uploadFile(jpeg, "image/png");

    const res = await submitWith([uploadToken]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_UPLOAD", message: "File contents do not match the declared type" },
    });
    await expectNothingSaved();
  });

  it("rejects a non-image disguised as an image, and a non-PDF declared as a PDF", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    for (const type of ["image/jpeg", "application/pdf"]) {
      const { uploadToken } = await uploadFile(html, type);
      expect((await submitWith([uploadToken])).status).toBe(400);
    }
    await expectNothingSaved();
  });

  it("rejects an image with a valid signature that can't be decoded", async () => {
    const truncated = (await imageWithExif("png")).subarray(0, 40);
    const { uploadToken } = await uploadFile(truncated, "image/png");
    const res = await submitWith([uploadToken]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_UPLOAD");
  });

  it("rejects a file larger than its declared size", async () => {
    const pdf = tinyPdf();
    const { uploadToken } = await uploadFile(pdf, "application/pdf", pdf.length - 10);
    const res = await submitWith([uploadToken]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/size/);
    await expectNothingSaved();
  });

  it("rejects a file over the 10 MB limit even if it was somehow uploaded", async () => {
    const huge = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    const [, payload] = uploadToken.split(".");
    const { path } = JSON.parse(Buffer.from(payload, "base64url").toString());
    objects.set(path, { body: huge, contentType: "application/pdf" });

    const res = await submitWith([uploadToken]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/10 MB/);
  });

  it("rejects a token claiming more than 10 MB", async () => {
    const token = await signUploadToken({
      jti: "a0000000-0000-4000-8000-000000000000",
      path: "staging/a0000000-0000-4000-8000-000000000000.pdf",
      mimeType: "application/pdf",
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    const res = await submitWith([token]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_UPLOAD_TOKEN");
  });

  it.each([
    ["garbage", async () => "not-a-token"],
    ["a moderator token", async () => signModeratorToken({ sub: "clx", email: "a@b.co", role: "ADMIN" })],
    [
      "a tampered token",
      async () => {
        const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
        const [h, p, s] = uploadToken.split(".");
        const claims = JSON.parse(Buffer.from(p, "base64url").toString());
        const forged = Buffer.from(JSON.stringify({ ...claims, path: "reports/other/secret.pdf" })).toString("base64url");
        return `${h}.${forged}.${s}`;
      },
    ],
  ])("rejects %s as an upload token with 400", async (_label, makeToken) => {
    const res = await submitWith([await makeToken()]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_UPLOAD_TOKEN");
    await expectNothingSaved();
  });

  it("rejects an expired upload token", async () => {
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    try {
      const res = await submitWith([uploadToken]);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_UPLOAD_TOKEN");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a token whose file was never uploaded", async () => {
    const res = await api.sign({ mimeType: "application/pdf", sizeBytes: 100 });
    const { uploadToken } = await res.json();
    const submit = await submitWith([uploadToken]);
    expect(submit.status).toBe(400);
    expect((await submit.json()).error.message).toMatch(/No uploaded file/);
  });
});

describe("upload token reuse", () => {
  it("rejects a token that was already used in an earlier submission", async () => {
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    expect((await submitWith([uploadToken])).status).toBe(201);

    const reuse = await submitWith([uploadToken]);
    expect(reuse.status).toBe(409);
    expect((await reuse.json()).error.code).toBe("UPLOAD_TOKEN_USED");
    expect(await prisma.report.count()).toBe(1);
    expect(await prisma.attachment.count()).toBe(1);
  });

  it("rejects the same token twice in one submission", async () => {
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    expect((await submitWith([uploadToken, uploadToken])).status).toBe(400);
    await expectNothingSaved();
  });

  it("lets only one of two concurrent submissions with the same token succeed, leaving no orphaned files", async () => {
    const { uploadToken } = await uploadFile(await imageWithExif("jpeg"), "image/jpeg");
    const results = await Promise.all([submitWith([uploadToken]), submitWith([uploadToken])]);

    expect(results.map((r) => r.status).filter((s) => s === 201)).toHaveLength(1);
    expect(await prisma.report.count()).toBe(1);
    const rows = await prisma.attachment.findMany();
    expect(pathsUnder("reports/")).toEqual(rows.map((r) => r.storagePath));
  });
});

describe("rollback when an attachment fails", () => {
  it("saves nothing if any one of several files is invalid, and keeps the uploads so the reporter can retry", async () => {
    const good1 = await uploadFile(await imageWithExif("jpeg"), "image/jpeg");
    const good2 = await uploadFile(tinyPdf(), "application/pdf");
    const bad = await uploadFile(Buffer.from("definitely not a png"), "image/png");

    const res = await submitWith([good1.uploadToken, good2.uploadToken, bad.uploadToken]);
    expect(res.status).toBe(400);
    await expectNothingSaved();
    // Staged files are kept and their tokens are still unused.
    expect(objects.has(good1.stagingPath) && objects.has(good2.stagingPath)).toBe(true);

    const retry = await submitWith([good1.uploadToken, good2.uploadToken]);
    expect(retry.status).toBe(201);
    expect(await prisma.attachment.count()).toBe(2);
  });

  it("removes already-stored files if storage fails partway through", async () => {
    const first = await uploadFile(tinyPdf(), "application/pdf");
    const second = await uploadFile(tinyPdf(), "application/pdf");
    let uploads = 0;
    failures.upload = () => ++uploads === 2;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await submitWith([first.uploadToken, second.uploadToken]);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    await expectNothingSaved();
    errorLog.mockRestore();
  });

  it("removes stored files if the database write fails", async () => {
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("connection lost"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await submitWith([uploadToken]);
    expect(res.status).toBe(500);
    await expectNothingSaved();
    spy.mockRestore();
    errorLog.mockRestore();
  });
});

describe("GET /api/mod/reports/:id/attachments/:attachmentId", () => {
  it("returns a signed download URL that expires after 60 seconds, to moderators only", async () => {
    const mod = await createAccount("MODERATOR");
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    await submitWith([uploadToken]);
    const [attachment] = await prisma.attachment.findMany();

    expect((await api.attachment(attachment.reportId, attachment.id)).status).toBe(401);

    const res = await api.attachment(attachment.reportId, attachment.id, mod.headers);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: expect.stringMatching(/^https:\/\/storage\.test\/object\/sign\//),
      expiresIn: 60,
      mimeType: "application/pdf",
      sizeBytes: attachment.sizeBytes,
    });
    expect(calls.signedDownloads).toEqual([{ path: attachment.storagePath, expiresIn: 60 }]);
  });

  it("returns 404 when the attachment belongs to a different report", async () => {
    const mod = await createAccount("MODERATOR");
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    await submitWith([uploadToken]);
    await api.submit(validReport);
    const [attachment] = await prisma.attachment.findMany();
    const other = await prisma.report.findFirstOrThrow({ where: { id: { not: attachment.reportId } } });

    expect((await api.attachment(other.id, attachment.id, mod.headers)).status).toBe(404);
    expect(calls.signedDownloads).toEqual([]);
  });

  it("does not expose attachments through the public lookup", async () => {
    const { uploadToken } = await uploadFile(tinyPdf(), "application/pdf");
    const { caseCode } = await (await submitWith([uploadToken])).json();
    const text = await (await api.lookup(caseCode)).text();
    expect(text).not.toMatch(/attachment|storage|reports\//i);
  });
});
