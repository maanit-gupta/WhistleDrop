/**
 * End-to-end tests of the API route handlers against a real Postgres database
 * (the disposable one from compose.test.yml; never Supabase). Only Supabase
 * Storage is replaced (by an in-memory fake); requests go through validation,
 * auth, the real Prisma client, the migrations' schema and real transactions.
 *
 * Run with: npm run test:db:up && npm run test:integration
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { CASE_CODE_PATTERN } from "@/lib/caseCode";
import { RATE_LIMITS, resetRateLimitsForTests } from "@/lib/rateLimit";
import { resetFakeStorage } from "../helpers/fakeStorage";
import { MODERATOR, resetDatabase, seedModerator } from "./db";
import { api, authHeaders, createReport, validReport } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

const moderatorAuth = () => authHeaders(MODERATOR.email, MODERATOR.password);

beforeEach(async () => {
  await resetDatabase();
  await seedModerator();
  resetRateLimitsForTests();
  resetFakeStorage();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("report submission", () => {
  it("returns 201 with a valid case code and stores a SUBMITTED report", async () => {
    const res = await api.submit(validReport);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toEqual({ caseCode: expect.stringMatching(CASE_CODE_PATTERN) });

    const stored = await prisma.report.findUniqueOrThrow({ where: { caseCode: body.caseCode } });
    expect(stored).toMatchObject({ ...validReport, status: "SUBMITTED", closedAt: null });
  });

  it("issues a different case code for every report", async () => {
    const codes = await Promise.all(
      Array.from({ length: 10 }, async () => (await (await api.submit(validReport)).json()).caseCode),
    );
    expect(new Set(codes).size).toBe(10);
    expect(await prisma.report.count()).toBe(10);
  });

  it.each([
    ["an invalid category", { ...validReport, category: "GOSSIP" }],
    ["a too-short description", { ...validReport, description: "Too short." }],
  ])("returns 400 for %s and writes nothing", async (_label, body) => {
    const res = await api.submit(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(await prisma.report.count()).toBe(0);
  });
});

describe("case-code lookup", () => {
  it("returns 404 for an unknown case code", async () => {
    await createReport();
    const res = await api.lookup("WD-ZZZZ-9999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Report not found" } });
  });

  it("returns the current status and full public history for a valid case code", async () => {
    const { caseCode, id } = await createReport();
    const auth = await moderatorAuth();
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Assigned to the audit team" }, auth);
    await api.patch(id, { newStatus: "RESOLVED", note: "Contracts re-tendered" }, auth);

    const res = await api.lookup(caseCode);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      category: validReport.category,
      description: validReport.description,
      evidenceUrl: validReport.evidenceUrl,
      status: "RESOLVED",
      createdAt: expect.any(String),
      statusUpdates: [
        { newStatus: "UNDER_REVIEW", note: "Assigned to the audit team", createdAt: expect.any(String) },
        { newStatus: "RESOLVED", note: "Contracts re-tendered", createdAt: expect.any(String) },
      ],
      conversation: [
        { type: "status", status: "UNDER_REVIEW", note: "Assigned to the audit team", createdAt: expect.any(String) },
        { type: "status", status: "RESOLVED", note: "Contracts re-tendered", createdAt: expect.any(String) },
      ],
    });
    expect(JSON.stringify(body)).not.toContain(id);
  });
});

describe("moderator login", () => {
  it("returns a bearer token that grants access to moderator routes", async () => {
    const res = await api.login(MODERATOR);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: expect.any(String), tokenType: "Bearer", expiresIn: 43200 });

    const [, payload] = body.token.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({ role: "ADMIN" });

    const list = await api.list({ authorization: `Bearer ${body.token}` });
    expect(list.status).toBe(200);
  });

  it.each([
    ["wrong password", { email: MODERATOR.email, password: "wrong-password" }],
    ["unknown email", { email: "someone@example.com", password: MODERATOR.password }],
  ])("returns the same generic 401 for a %s", async (_label, credentials) => {
    const res = await api.login(credentials);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
    });
  });
});

describe("moderator routes without authentication", () => {
  it("return 401 for every /api/mod/* and /api/admin/* route and change nothing", async () => {
    const { id } = await createReport();
    const noAuth = [
      await api.list(),
      await api.get(id),
      await api.patch(id, { newStatus: "UNDER_REVIEW" }),
      await api.attachment(id, "clattachment0000000000001"),
      await api.admin.list(),
      await api.admin.create({ email: "x@example.com", password: "long-enough-password" }),
      await api.admin.update(id, { isActive: false }),
      await api.list({ authorization: "Bearer forged.token.value" }),
    ];

    for (const res of noAuth) {
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    }
    expect(await prisma.report.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SUBMITTED" });
    expect(await prisma.statusUpdate.count()).toBe(0);
    expect(await prisma.moderator.count()).toBe(1);
  });
});

describe("status transitions", () => {
  it("applies a valid transition and records a StatusUpdate row", async () => {
    const { id } = await createReport();
    const res = await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Triaged" }, await moderatorAuth());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id,
      status: "UNDER_REVIEW",
      statusUpdates: [{ newStatus: "UNDER_REVIEW", note: "Triaged", visibility: "PUBLIC" }],
    });

    expect(await prisma.report.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "UNDER_REVIEW" });
    expect(await prisma.statusUpdate.findMany({ where: { reportId: id } })).toEqual([
      expect.objectContaining({ newStatus: "UNDER_REVIEW", note: "Triaged" }),
    ]);
  });

  it("returns 409 for an invalid transition and leaves the report untouched", async () => {
    const { id } = await createReport();
    const res = await api.patch(id, { newStatus: "RESOLVED" }, await moderatorAuth());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVALID_TRANSITION");

    expect(await prisma.report.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SUBMITTED" });
    expect(await prisma.statusUpdate.count()).toBe(0);
  });

  it("lets exactly one of several concurrent identical transitions win", async () => {
    const { id } = await createReport();
    const auth = await moderatorAuth();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => api.patch(id, { newStatus: "UNDER_REVIEW" }, auth)),
    );

    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    expect(await prisma.statusUpdate.count({ where: { reportId: id } })).toBe(1);
  });

  it("returns the report with its full history to moderators", async () => {
    const { id } = await createReport();
    const auth = await moderatorAuth();
    await api.patch(id, { newStatus: "UNDER_REVIEW" }, auth);
    await api.patch(id, { newStatus: "DISMISSED", note: "Duplicate" }, auth);

    const res = await api.get(id, auth);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("DISMISSED");
    expect(body.statusUpdates.map((u: { newStatus: string }) => u.newStatus)).toEqual(["UNDER_REVIEW", "DISMISSED"]);
  });
});

describe("rate limiting (in-memory backend under NODE_ENV=test)", () => {
  const exhaust = async (limit: number, call: () => Promise<Response>) => {
    for (let i = 0; i < limit; i++) expect((await call()).status).not.toBe(429);
    return call();
  };
  const expect429 = async (res: Response) => {
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  };

  it(`returns 429 after ${RATE_LIMITS.lookup.limit} rapid case-code lookups from one IP`, async () => {
    const { caseCode } = await createReport();
    await expect429(await exhaust(RATE_LIMITS.lookup.limit, () => api.lookup(caseCode)));
    // Other addresses are unaffected.
    expect((await api.lookup(caseCode, "198.51.100.2")).status).toBe(200);
  });

  it(`returns 429 after ${RATE_LIMITS.submit.limit} submissions and stores nothing more`, async () => {
    await expect429(await exhaust(RATE_LIMITS.submit.limit, () => api.submit(validReport)));
    expect(await prisma.report.count()).toBe(RATE_LIMITS.submit.limit);
  });

  it(`returns 429 after ${RATE_LIMITS.uploadSign.limit} upload signings`, async () => {
    await expect429(
      await exhaust(RATE_LIMITS.uploadSign.limit, () => api.sign({ mimeType: "image/png", sizeBytes: 100 })),
    );
  });

  it(`returns 429 after ${RATE_LIMITS.login.limit} login attempts, even with the right password`, async () => {
    await expect429(await exhaust(RATE_LIMITS.login.limit, () => api.login({ ...MODERATOR, password: "guess" })));
    expect((await api.login(MODERATOR)).status).toBe(429);
  });
});
