import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signModeratorToken } from "@/lib/auth";
import { GET as cleanup } from "@/app/api/cron/cleanup/route";
import { objects, pathsUnder, resetFakeStorage, simulateBrowserUpload } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

const run = (authorization?: string) =>
  cleanup(new Request("http://localhost/api/cron/cleanup", { headers: authorization ? { authorization } : {} }));
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const CRON = () => `Bearer ${process.env.CRON_SECRET}`;

beforeEach(async () => {
  await resetDatabase();
  resetFakeStorage();

  // Staging: one abandoned upload, one still usable, one at the edge.
  simulateBrowserUpload("staging/old.pdf", Buffer.from("%PDF-"), "application/pdf", minutesAgo(120));
  simulateBrowserUpload("staging/edge.pdf", Buffer.from("%PDF-"), "application/pdf", minutesAgo(61));
  simulateBrowserUpload("staging/fresh.jpg", Buffer.from("jpg"), "image/jpeg", minutesAgo(5));
  // Evidence of a live report, however old, must never be touched.
  simulateBrowserUpload("reports/clreport00000000000000001/a.jpg", Buffer.from("jpg"), "image/jpeg", minutesAgo(10_000));

  await prisma.consumedUploadToken.createMany({
    data: [
      { jti: "expired-1", consumedAt: minutesAgo(45) },
      { jti: "expired-2", consumedAt: minutesAgo(60 * 24) },
      { jti: "recent", consumedAt: minutesAgo(10) },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/cron/cleanup", () => {
  it("deletes staging objects older than 1 hour and consumed tokens older than the token lifetime", async () => {
    const res = await run(CRON());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedStagingObjects: 2, deletedConsumedUploadTokens: 2 });

    expect(pathsUnder("staging/")).toEqual(["staging/fresh.jpg"]);
    expect(pathsUnder("reports/")).toEqual(["reports/clreport00000000000000001/a.jpg"]);
    expect((await prisma.consumedUploadToken.findMany()).map((t) => t.jti)).toEqual(["recent"]);
  });

  it("is idempotent", async () => {
    await run(CRON());
    expect(await (await run(CRON())).json()).toEqual({ deletedStagingObjects: 0, deletedConsumedUploadTokens: 0 });
  });

  it.each([
    ["no Authorization header", undefined],
    ["a wrong secret", "Bearer not-the-cron-secret-but-long-enough-to-look-real"],
    ["the secret without the Bearer scheme", `${process.env.CRON_SECRET}`],
    ["a moderator token", "moderator"],
  ])("returns 401 for %s and deletes nothing", async (_label, header) => {
    const authorization =
      header === "moderator"
        ? `Bearer ${await signModeratorToken({ sub: "clx", email: "a@b.co", role: "ADMIN" })}`
        : header;
    const res = await run(authorization);
    expect(res.status).toBe(401);
    expect(objects.size).toBe(4);
    expect(await prisma.consumedUploadToken.count()).toBe(3);
  });

  it("fails closed with 500 when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await run("Bearer ")).status).toBe(500);
      expect((await run(undefined)).status).toBe(500);
      expect(objects.size).toBe(4);
    } finally {
      vi.unstubAllEnvs();
      errorLog.mockRestore();
    }
  });
});
