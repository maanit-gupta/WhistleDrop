import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import { failures, pathsUnder, resetFakeStorage, simulateBrowserUpload } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";
import { api, createAccount, createReport, imageWithExif, moveThrough, tinyPdf, uploadFile } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

let auth: Record<string, string>;

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  resetFakeStorage();
  ({ headers: auth } = await createAccount("MODERATOR"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function reportWithEvidence() {
  const image = await uploadFile(await imageWithExif("jpeg"), "image/jpeg");
  const pdf = await uploadFile(tinyPdf(), "application/pdf");
  return createReport({ attachments: [image.uploadToken, pdf.uploadToken] });
}

describe("closing a report", () => {
  it.each<[ReportStatus[]]>([[["UNDER_REVIEW", "RESOLVED"]], [["UNDER_REVIEW", "DISMISSED"]]])(
    "allows %j -> CLOSED, sets closedAt and records the update",
    async (path) => {
      const { id } = await createReport();
      await moveThrough(id, path, auth);

      const before = Date.now();
      const res = await api.patch(id, { newStatus: "CLOSED", note: "Case archived" }, auth);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status).toBe("CLOSED");
      expect(new Date(body.closedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(body.statusUpdates.at(-1)).toMatchObject({ newStatus: "CLOSED", note: "Case archived" });
    },
  );

  it.each<[ReportStatus[]]>([[[]], [["UNDER_REVIEW"]]])("rejects CLOSED after %j with 409", async (path) => {
    const { id } = await createReport();
    await moveThrough(id, path, auth);
    const res = await api.patch(id, { newStatus: "CLOSED" }, auth);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVALID_TRANSITION");
    expect(await prisma.report.findUniqueOrThrow({ where: { id } })).toMatchObject({ closedAt: null });
  });
});

describe("a CLOSED report is read-only", () => {
  const attempts: [string, Record<string, unknown>][] = [
    ["reopen to SUBMITTED", { newStatus: "SUBMITTED" }],
    ["reopen to UNDER_REVIEW", { newStatus: "UNDER_REVIEW" }],
    ["change to RESOLVED", { newStatus: "RESOLVED" }],
    ["change to DISMISSED", { newStatus: "DISMISSED" }],
    ["close again", { newStatus: "CLOSED" }],
    ["add a public note", { newStatus: "CLOSED", note: "One more thing" }],
    ["add an internal note", { newStatus: "CLOSED", note: "Internal remark", visibility: "INTERNAL" }],
  ];

  it.each(attempts)("returns 423 Locked for an attempt to %s and changes nothing", async (_label, body) => {
    const { id } = await createReport();
    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED", "CLOSED"], auth);
    const before = await prisma.report.findUniqueOrThrow({ where: { id }, include: { statusUpdates: true } });

    const res = await api.patch(id, body, auth);
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({
      error: { code: "REPORT_CLOSED", message: "This report is closed and can no longer be changed" },
    });

    const after = await prisma.report.findUniqueOrThrow({ where: { id }, include: { statusUpdates: true } });
    expect(after).toEqual(before);
  });

  it("also returns 423 to an ADMIN", async () => {
    const admin = await createAccount("ADMIN");
    const { id } = await createReport();
    await moveThrough(id, ["UNDER_REVIEW", "DISMISSED", "CLOSED"], auth);
    expect((await api.patch(id, { newStatus: "UNDER_REVIEW" }, admin.headers)).status).toBe(423);
  });

  it("stays readable by moderators and reporters", async () => {
    const { id, caseCode } = await createReport();
    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED", "CLOSED"], auth);
    expect((await api.get(id, auth)).status).toBe(200);
    expect(await (await api.lookup(caseCode)).json()).toMatchObject({ status: "CLOSED" });
  });
});

describe("evidence purge on close", () => {
  it("deletes the report's files from storage and its Attachment rows, and nothing else", async () => {
    const { id } = await reportWithEvidence();
    const other = await reportWithEvidence();
    // A stray object under the report's folder (e.g. from an earlier failed cleanup).
    simulateBrowserUpload(`reports/${id}/stray.jpg`, Buffer.from("leftover"));
    expect(pathsUnder(`reports/${id}/`)).toHaveLength(3);
    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED"], auth);

    const res = await api.patch(id, { newStatus: "CLOSED" }, auth);
    expect(res.status).toBe(200);
    expect((await res.json()).attachments).toEqual([]);

    expect(pathsUnder(`reports/${id}/`)).toEqual([]);
    expect(await prisma.attachment.count({ where: { reportId: id } })).toBe(0);
    // The other report's evidence is untouched.
    expect(pathsUnder(`reports/${other.id}/`)).toHaveLength(2);
    expect(await prisma.attachment.count({ where: { reportId: other.id } })).toBe(2);
  });

  it("makes purged attachments unavailable for download", async () => {
    const { id } = await reportWithEvidence();
    const [attachment] = await prisma.attachment.findMany({ where: { reportId: id } });
    expect((await api.attachment(id, attachment.id, auth)).status).toBe(200);

    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED", "CLOSED"], auth);
    expect((await api.attachment(id, attachment.id, auth)).status).toBe(404);
  });

  it("leaves the report open and intact if the storage purge fails, so the close can be retried", async () => {
    const { id } = await reportWithEvidence();
    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED"], auth);
    failures.remove = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await api.patch(id, { newStatus: "CLOSED" }, auth);
    expect(res.status).toBe(500);
    expect(await prisma.report.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "RESOLVED", closedAt: null });
    expect(await prisma.attachment.count({ where: { reportId: id } })).toBe(2);
    errorLog.mockRestore();

    failures.remove = false;
    expect((await api.patch(id, { newStatus: "CLOSED" }, auth)).status).toBe(200);
    expect(pathsUnder(`reports/${id}/`)).toEqual([]);
  });
});
