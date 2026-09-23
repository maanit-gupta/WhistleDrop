import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// In-memory stand-in for the Prisma client: only what these routes touch.
const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const pick = (row: Row, select?: Record<string, unknown>): Row => {
    if (!select) return row;
    const out: Row = {};
    for (const [key, spec] of Object.entries(select)) {
      if (spec === true) out[key] = row[key];
      else if (spec && typeof spec === "object" && Array.isArray(row[key])) {
        const { select: nested, where } = spec as { select?: Record<string, unknown>; where?: Row };
        const rows = (row[key] as Row[]).filter((r) => Object.entries(where ?? {}).every(([k, v]) => r[k] === v));
        out[key] = rows.map((r) => pick(r, nested));
      }
    }
    return out;
  };
  const state = { reports: [] as Row[], failNextCreateWith: null as unknown };
  const prisma = {
    report: {
      findUnique: vi.fn(async ({ where, select }: { where: Row; select?: Record<string, unknown> }) => {
        const [key, value] = Object.entries(where)[0];
        const row = state.reports.find((r) => r[key] === value);
        return row ? pick(row, select) : null;
      }),
      create: vi.fn(async ({ data, select }: { data: Row; select?: Record<string, unknown> }) => {
        if (state.failNextCreateWith) {
          const err = state.failNextCreateWith;
          state.failNextCreateWith = null;
          throw err;
        }
        const now = new Date();
        const row = {
          id: `clreport${String(state.reports.length + 1).padStart(17, "0")}`,
          status: "SUBMITTED",
          evidenceUrl: null,
          createdAt: now,
          updatedAt: now,
          statusUpdates: [],
          ...data,
        };
        state.reports.push(row);
        return pick(row, select);
      }),
    },
    consumedUploadToken: { count: vi.fn(async () => 0), createMany: vi.fn(async () => ({ count: 0 })) },
    attachment: { createMany: vi.fn(async () => ({ count: 0 })) },
    // Array form only: the operations have already been started, so await them in order.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => {
      const results = [];
      for (const op of ops) results.push(await op);
      return results;
    }),
  };
  return { state, prisma };
});

vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/storage", () => import("./helpers/fakeStorage"));

import { POST } from "@/app/api/reports/route";
import { GET } from "@/app/api/reports/[caseCode]/route";
import { CASE_CODE_PATTERN } from "@/lib/caseCode";
import { RATE_LIMITS, resetRateLimitsForTests } from "@/lib/rateLimit";

const submit = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const lookup = (caseCode: string, ip = "198.51.100.1") =>
  GET(new Request(`http://localhost/api/reports/${caseCode}`, { headers: { "x-forwarded-for": ip } }), {
    params: Promise.resolve({ caseCode }),
  });

const validReport = {
  category: "SECURITY",
  description: "The staging database is reachable from the public internet.",
};

beforeEach(() => {
  db.state.reports = [];
  db.state.failNextCreateWith = null;
  resetRateLimitsForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/reports", () => {
  it("creates a SUBMITTED report and returns 201 with only the case code", async () => {
    const res = await submit({ ...validReport, evidenceUrl: "https://example.com/evidence.png" });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json();
    expect(Object.keys(body)).toEqual(["caseCode"]);
    expect(body.caseCode).toMatch(CASE_CODE_PATTERN);
    expect(db.state.reports[0]).toMatchObject({ caseCode: body.caseCode, status: "SUBMITTED" });
  });

  it("stores only the validated fields, never request metadata", async () => {
    await submit(validReport, {
      "x-forwarded-for": "203.0.113.7",
      "user-agent": "Mozilla/5.0",
      cookie: "session=abc",
    });

    const { data } = db.prisma.report.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(["caseCode", "category", "description", "id"]);
    expect(JSON.stringify(db.state.reports)).not.toMatch(/203\.0\.113\.7|Mozilla|session=abc/);
  });

  it.each([
    ["exactly 20 characters", "a".repeat(20)],
    ["exactly 5000 characters", "a".repeat(5000)],
  ])("accepts a description of %s", async (_label, description) => {
    const res = await submit({ ...validReport, description });
    expect(res.status).toBe(201);
  });

  it.each([
    ["description under 20 characters", { ...validReport, description: "a".repeat(19) }],
    ["description over 5000 characters", { ...validReport, description: "a".repeat(5001) }],
    ["description padded with whitespace to reach 20", { ...validReport, description: `   ${"a".repeat(10)}        ` }],
    ["missing description", { category: "SECURITY" }],
    ["unknown category", { ...validReport, category: "GOSSIP" }],
    ["missing category", { description: validReport.description }],
    ["non-http evidence URL", { ...validReport, evidenceUrl: "javascript:alert(1)" }],
    ["malformed evidence URL", { ...validReport, evidenceUrl: "not a url" }],
    ["identifying extra field", { ...validReport, email: "me@example.com" }],
    ["non-object body", ["SECURITY"]],
  ])("rejects %s with 400 before touching the database", async (_label, body) => {
    const res = await submit(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(typeof json.error.message).toBe("string");
    expect(db.prisma.report.create).not.toHaveBeenCalled();
    expect(db.prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await submit("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "BAD_REQUEST", message: "Request body must be valid JSON" },
    });
  });

  it("retries with a new case code when the unique constraint is hit", async () => {
    db.state.failNextCreateWith = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["caseCode"] },
    });
    const res = await submit(validReport);
    expect(res.status).toBe(201);
    expect(db.prisma.report.create).toHaveBeenCalledTimes(2);
  });

  it("returns a generic 500 without leaking internal errors", async () => {
    db.state.failNextCreateWith = new Error("connection refused at 10.0.0.5:5432");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await submit(validReport);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/10\.0\.0\.5|at .*\.ts/);
    expect(JSON.parse(text)).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain(validReport.description);
    errorLog.mockRestore();
  });
});

describe("GET /api/reports/:caseCode", () => {
  it("returns the report and its status history without any internal ids", async () => {
    const evidenceUrl = "https://example.com/e";
    const { caseCode } = await (await submit({ ...validReport, evidenceUrl })).json();
    db.state.reports[0].status = "UNDER_REVIEW";
    const moderatorId = "clmoderator00000000000001";
    db.state.reports[0].statusUpdates = [
      { id: "clupdate00000000000000001", reportId: db.state.reports[0].id, newStatus: "UNDER_REVIEW", note: "Looking into it", visibility: "PUBLIC", moderatorId, createdAt: new Date() },
      { id: "clupdate00000000000000002", reportId: db.state.reports[0].id, newStatus: "UNDER_REVIEW", note: "Internal only", visibility: "INTERNAL", moderatorId, createdAt: new Date() },
    ];

    const res = await lookup(caseCode);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      category: "SECURITY",
      description: validReport.description,
      evidenceUrl,
      status: "UNDER_REVIEW",
      createdAt: expect.any(String),
      statusUpdates: [{ note: "Looking into it", newStatus: "UNDER_REVIEW", createdAt: expect.any(String) }],
    });
    expect(JSON.stringify(body)).not.toMatch(/clreport|clupdate|clmoderator|reportId|"id"|Internal only|visibility/);
  });

  it("accepts lowercase and whitespace-padded case codes", async () => {
    const { caseCode } = await (await submit(validReport)).json();
    const res = await lookup(`  ${caseCode.toLowerCase()} `);
    expect(res.status).toBe(200);
  });

  it("returns 404 with a generic message for an unknown case code", async () => {
    const res = await lookup("WD-AAAA-BBBB");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Report not found" } });
  });

  it("returns the identical 404 for a malformed case code, without querying the database", async () => {
    const unknown = await (await lookup("WD-AAAA-BBBB")).json();
    for (const code of ["garbage", "WD-AAAA", "WD-AAA!-BBBB", "clreport00000000000000001"]) {
      const res = await lookup(code);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(unknown);
    }
    expect(db.prisma.report.findUnique).toHaveBeenCalledTimes(1);
  });

  describe("rate limiting", () => {
    const { limit, windowSeconds } = RATE_LIMITS.lookup;
    const windowMs = windowSeconds * 1000;

    it(`allows ${limit} lookups per IP per window, then returns 429 with Retry-After`, async () => {
      for (let i = 0; i < limit; i++) expect((await lookup("WD-AAAA-BBBB")).status).toBe(404);

      const res = await lookup("WD-AAAA-BBBB");
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({
        error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
      });
      const retryAfter = Number(res.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(windowMs / 1000);
      expect(db.prisma.report.findUnique).toHaveBeenCalledTimes(limit);
    });

    it("counts malformed guesses against the limit", async () => {
      for (let i = 0; i < limit; i++) await lookup("garbage");
      expect((await lookup("WD-AAAA-BBBB")).status).toBe(429);
    });

    it("tracks each IP separately", async () => {
      for (let i = 0; i < limit; i++) await lookup("WD-AAAA-BBBB", "198.51.100.1");
      expect((await lookup("WD-AAAA-BBBB", "198.51.100.1")).status).toBe(429);
      expect((await lookup("WD-AAAA-BBBB", "198.51.100.2")).status).toBe(404);
    });

    it("uses the first X-Forwarded-For hop as the client IP", async () => {
      for (let i = 0; i < limit; i++) await lookup("WD-AAAA-BBBB", `198.51.100.1, 10.0.0.${i}`);
      expect((await lookup("WD-AAAA-BBBB", "198.51.100.1, 10.0.0.99")).status).toBe(429);
    });

    it("resets once the window has passed", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      for (let i = 0; i < limit; i++) await lookup("WD-AAAA-BBBB");
      expect((await lookup("WD-AAAA-BBBB")).status).toBe(429);

      vi.setSystemTime(Date.now() + windowMs);
      expect((await lookup("WD-AAAA-BBBB")).status).toBe(404);
    });
  });
});
