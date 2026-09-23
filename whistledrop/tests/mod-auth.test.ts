import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { SignJWT, UnsecuredJWT } from "jose";

type FakeModerator = { id: string; email: string; passwordHash: string; role: "ADMIN" | "MODERATOR"; isActive: boolean };

const db = vi.hoisted(() => ({
  moderators: [] as FakeModerator[],
  prisma: {
    moderator: { findUnique: vi.fn() },
    report: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/storage", () => import("./helpers/fakeStorage"));

import { POST as login } from "@/app/api/mod/login/route";
import { GET as listReports } from "@/app/api/mod/reports/route";
import { GET as getReport } from "@/app/api/mod/reports/[id]/route";
import { PATCH as patchStatus } from "@/app/api/mod/reports/[id]/status/route";
import { signModeratorToken, verifyToken } from "@/lib/auth";
import { withModerator } from "@/lib/guards";
import { moderatorReportDetail } from "@/lib/reports";
import { resetRateLimitsForTests } from "@/lib/rateLimit";

const EMAIL = "mod@example.com";
const PASSWORD = "correct horse battery staple";
const MOD_ID = "clmoderator00000000000001";
const REPORT_ID = "clreport00000000000000001";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

const loginWith = (body: unknown) =>
  login(
    new Request("http://localhost/api/mod/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const bearer = async () => ({
  authorization: `Bearer ${await signModeratorToken({ sub: MOD_ID, email: EMAIL, role: "MODERATOR" })}`,
});

beforeAll(async () => {
  db.moderators = [
    { id: MOD_ID, email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), role: "MODERATOR", isActive: true },
  ];
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitsForTests();
  for (const m of db.moderators) m.isActive = true;
  // Login looks moderators up by email, the auth guard by id.
  db.prisma.moderator.findUnique.mockImplementation(
    async ({ where }: { where: { email?: string; id?: string } }) =>
      db.moderators.find((m) => (where.id ? m.id === where.id : m.email === where.email)) ?? null,
  );
  db.prisma.report.findMany.mockResolvedValue([]);
  db.prisma.report.findUnique.mockResolvedValue(null);
  db.prisma.report.count.mockResolvedValue(0);
  // Array form (list route: [count, findMany]) runs the queries; callback form isn't reached here.
  db.prisma.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : null));
});

describe("POST /api/mod/login", () => {
  it("returns a 12-hour bearer token for valid credentials", async () => {
    const res = await loginWith({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBe(12 * 60 * 60);
    expect(JSON.stringify(body)).not.toContain("$2");
    expect(await verifyToken(body.token)).toEqual({ sub: MOD_ID, email: EMAIL, role: "MODERATOR" });

    const [, payload] = body.token.split(".");
    const { iat, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(exp - iat).toBe(12 * 60 * 60);
  });

  it("normalizes email case and surrounding whitespace", async () => {
    const res = await loginWith({ email: `  ${EMAIL.toUpperCase()} `, password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password and an unknown email with the same generic 401", async () => {
    const wrongPassword = await loginWith({ email: EMAIL, password: "wrong" });
    const unknownEmail = await loginWith({ email: "nobody@example.com", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const expected = { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };
    expect(await wrongPassword.json()).toEqual(expected);
    expect(await unknownEmail.json()).toEqual(expected);
  });

  it("still runs a bcrypt comparison for unknown emails", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    await loginWith({ email: "nobody@example.com", password: PASSWORD });
    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  it.each([
    ["missing password", { email: EMAIL }],
    ["empty password", { email: EMAIL, password: "" }],
    ["invalid email", { email: "not-an-email", password: PASSWORD }],
    ["extra fields", { email: EMAIL, password: PASSWORD, role: "admin" }],
  ])("rejects %s with 400 before touching the database", async (_label, body) => {
    const res = await loginWith(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(db.prisma.moderator.findUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await loginWith("{");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
  });
});

describe("withModerator", () => {
  it("passes the verified moderator to the handler", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const guarded = withModerator(handler);
    const req = new Request("http://localhost", { headers: await bearer() });
    const ctx = { params: Promise.resolve({}) };

    expect((await guarded(req, ctx)).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(req, ctx, { id: MOD_ID, email: EMAIL, role: "MODERATOR" });
  });

  it("returns 401 without calling the handler when the account has been deactivated", async () => {
    db.moderators[0].isActive = false;
    const handler = vi.fn(async () => new Response("ok"));
    const res = await withModerator(handler)(new Request("http://localhost", { headers: await bearer() }), {});
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 without calling the handler when the token is missing", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const res = await withModerator(handler)(new Request("http://localhost"), {});
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("moderator auth guard on every moderator route", () => {
  const routes = {
    "GET /api/mod/reports": (headers: HeadersInit) =>
      listReports(new NextRequest("http://localhost/api/mod/reports", { headers }), { params: Promise.resolve({}) }),
    "GET /api/mod/reports/:id": (headers: HeadersInit) =>
      getReport(new Request(`http://localhost/api/mod/reports/${REPORT_ID}`, { headers }), {
        params: Promise.resolve({ id: REPORT_ID }),
      }),
    "PATCH /api/mod/reports/:id/status": (headers: HeadersInit) =>
      patchStatus(
        new Request(`http://localhost/api/mod/reports/${REPORT_ID}/status`, {
          method: "PATCH",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ newStatus: "UNDER_REVIEW" }),
        }),
        { params: Promise.resolve({ id: REPORT_ID }) },
      ),
  };

  const now = () => Math.floor(Date.now() / 1000);
  const jwt = (claims: { aud?: string; exp?: number | string; iat?: number }, key = secret) => {
    const t = new SignJWT({ email: EMAIL, role: "MODERATOR" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(MOD_ID)
      .setIssuer("whistledrop")
      .setAudience(claims.aud ?? "whistledrop:moderator")
      .setExpirationTime(claims.exp ?? "1h");
    if (claims.iat) t.setIssuedAt(claims.iat);
    return t.sign(key);
  };

  const badTokens: Record<string, () => Promise<HeadersInit>> = {
    "no Authorization header": async () => ({}),
    "non-Bearer scheme": async () => ({ authorization: (await bearer()).authorization.replace("Bearer", "Basic") }),
    "empty Bearer token": async () => ({ authorization: "Bearer " }),
    "garbage token": async () => ({ authorization: "Bearer not.a.jwt" }),
    "expired token": async () => ({ authorization: `Bearer ${await jwt({ iat: now() - 13 * 3600, exp: now() - 3600 })}` }),
    "token signed with another secret": async () => ({
      authorization: `Bearer ${await jwt({}, new TextEncoder().encode("some-other-secret-that-is-32-chars-long!!"))}`,
    }),
    "token with wrong audience": async () => ({ authorization: `Bearer ${await jwt({ aud: "someone-else" })}` }),
    'unsigned "alg: none" token': async () => ({
      authorization: `Bearer ${new UnsecuredJWT({ email: EMAIL, role: "MODERATOR" })
        .setSubject(MOD_ID)
        .setIssuer("whistledrop")
        .setAudience("whistledrop:moderator")
        .setExpirationTime("1h")
        .encode()}`,
    }),
  };

  for (const [routeName, call] of Object.entries(routes)) {
    describe(routeName, () => {
      it.each(Object.keys(badTokens))("returns 401 for %s without touching the database", async (tokenCase) => {
        const res = await call(await badTokens[tokenCase]());
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
        expect(db.prisma.moderator.findUnique).not.toHaveBeenCalled();
        expect(db.prisma.report.findMany).not.toHaveBeenCalled();
        expect(db.prisma.report.findUnique).not.toHaveBeenCalled();
        expect(db.prisma.$transaction).not.toHaveBeenCalled();
      });

      it("lets a valid token through", async () => {
        const res = await call(await bearer());
        expect(res.status).not.toBe(401);
      });
    });
  }

  it("accepts a token issued by the login route", async () => {
    const { token } = await (await loginWith({ email: EMAIL, password: PASSWORD })).json();
    const res = await routes["GET /api/mod/reports"]({ authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });
});

describe("moderator report routes (authenticated)", () => {
  const list = async (query = "") =>
    listReports(new NextRequest(`http://localhost/api/mod/reports${query}`, { headers: await bearer() }), {
      params: Promise.resolve({}),
    });
  const get = async (id: string) =>
    getReport(new Request(`http://localhost/api/mod/reports/${id}`, { headers: await bearer() }), {
      params: Promise.resolve({ id }),
    });

  it("lists reports with only id, caseCode, category, status and createdAt", async () => {
    await list();
    const { select } = db.prisma.report.findMany.mock.calls[0][0];
    expect(Object.keys(select).sort()).toEqual(["caseCode", "category", "closedAt", "createdAt", "id", "status", "updatedAt"]);
  });

  it("passes status and category filters to the query", async () => {
    await list("?status=UNDER_REVIEW&category=CORRUPTION");
    expect(db.prisma.report.findMany.mock.calls[0][0].where).toEqual({
      status: { in: ["UNDER_REVIEW"] },
      category: { in: ["CORRUPTION"] },
    });
  });

  it.each([
    ["unknown status", "?status=ARCHIVED"],
    ["unknown category", "?category=GOSSIP"],
    ["pageSize out of range", "?pageSize=500"],
    ["an unknown parameter", "?cursor=' OR 1=1"],
  ])("rejects %s with 400 before touching the database", async (_label, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(db.prisma.report.findMany).not.toHaveBeenCalled();
  });

  it("returns a report with its full status history", async () => {
    const report = { id: REPORT_ID, status: "UNDER_REVIEW", statusUpdates: [{ id: "clupdate00000000000000001", newStatus: "UNDER_REVIEW" }] };
    db.prisma.report.findUnique.mockResolvedValue(report);
    const res = await get(REPORT_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(report);
    expect(db.prisma.report.findUnique.mock.calls[0][0].include).toEqual(moderatorReportDetail);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await get(REPORT_ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Report not found" } });
  });

  it("returns 404 for a malformed id without touching the database", async () => {
    expect((await get("not-a-cuid")).status).toBe(404);
    expect(db.prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when the database fails", async () => {
    db.prisma.report.findMany.mockRejectedValue(new Error("pgbouncer: connection pool exhausted"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await list();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("pgbouncer");
    errorLog.mockRestore();
  });
});
