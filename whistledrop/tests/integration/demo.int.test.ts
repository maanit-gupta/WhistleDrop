import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import {
  DEMO_ACCOUNTS,
  DEMO_CASES,
  assertDemoSeedAllowed,
  reassertDemoAccounts,
  resetDemoCases,
  seedDemoAccounts,
  seedDemoCases,
} from "@/lib/demo";
import { GET as cleanup } from "@/app/api/cron/cleanup/route";
import { pathsUnder, resetFakeStorage } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";
import { api, authHeaders, createAccount, createReport, imageWithExif, tinyPdf, uploadFile } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  resetFakeStorage();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const stored = (id: string) =>
  prisma.moderator.findUniqueOrThrow({ where: { id }, select: { role: true, isActive: true } });
const errorCode = async (res: Response) => (await res.json()).error.code;

describe("demo accounts can't change other demo accounts", () => {
  it.each([
    ["demote", { role: "MODERATOR" }],
    ["deactivate", { isActive: false }],
  ])("refuses a demo admin's attempt to %s another demo admin", async (_label, change) => {
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    const otherDemoAdmin = await createAccount("ADMIN", { isDemo: true });
    const res = await api.admin.update(otherDemoAdmin.id, change, demoAdmin.headers);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("DEMO_ACCOUNT_PROTECTED");
    expect(await stored(otherDemoAdmin.id)).toEqual({ role: "ADMIN", isActive: true });
  });

  it.each([
    ["promote", { role: "ADMIN" }],
    ["deactivate", { isActive: false }],
  ])("refuses a demo admin's attempt to %s a demo moderator", async (_label, change) => {
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    const demoMod = await createAccount("MODERATOR", { isDemo: true });
    const res = await api.admin.update(demoMod.id, change, demoAdmin.headers);
    expect(res.status).toBe(403);
    expect(await stored(demoMod.id)).toEqual({ role: "MODERATOR", isActive: true });
  });
});

describe("demo accounts can't change non-demo accounts", () => {
  it.each([
    ["demote", { role: "MODERATOR" }, "ADMIN", true],
    ["deactivate", { isActive: false }, "ADMIN", true],
    ["deactivate a moderator", { isActive: false }, "MODERATOR", true],
    // Promoting or reactivating would hand ADMIN, or a retired account, to whoever holds the public credentials.
    ["promote", { role: "ADMIN" }, "MODERATOR", true],
    ["reactivate", { isActive: true }, "ADMIN", false],
  ] as const)("refuses a demo admin's attempt to %s one", async (_label, change, role, isActive) => {
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    const real = await createAccount(role);
    if (!isActive) await prisma.moderator.update({ where: { id: real.id }, data: { isActive: false } });

    const res = await api.admin.update(real.id, change, demoAdmin.headers);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "DEMO_ACCOUNT_RESTRICTED", message: "Demo accounts can't change another account's role or active status" },
    });
    expect(await stored(real.id)).toEqual({ role, isActive });
  });

  it("lets a demo admin create MODERATOR accounts but not ADMIN ones", async () => {
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    const made = await api.admin.create({ email: "trial@example.com", password: "a-long-enough-password" }, demoAdmin.headers);
    expect(made.status).toBe(201);
    expect(await made.json()).toMatchObject({ role: "MODERATOR", isDemo: false });

    const admin = await api.admin.create(
      { email: "escalate@example.com", password: "a-long-enough-password", role: "ADMIN" },
      demoAdmin.headers,
    );
    expect(admin.status).toBe(403);
    expect(await errorCode(admin)).toBe("DEMO_ACCOUNT_RESTRICTED");
    expect(await prisma.moderator.count({ where: { email: "escalate@example.com" } })).toBe(0);
  });

  it("still lets a demo admin list accounts, and a demo moderator is still not an admin", async () => {
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    const demoMod = await createAccount("MODERATOR", { isDemo: true });
    expect((await api.admin.list(demoAdmin.headers)).status).toBe(200);
    expect(await errorCode(await api.admin.list(demoMod.headers))).toBe("FORBIDDEN");
  });
});

describe("demo accounts can't be deactivated or demoted through the API", () => {
  it.each([
    ["demote", { role: "MODERATOR" }],
    ["deactivate", { isActive: false }],
    ["demote and deactivate", { role: "MODERATOR", isActive: false }],
  ])("refuses a real admin's attempt to %s a demo admin", async (_label, change) => {
    const admin = await createAccount("ADMIN");
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    const res = await api.admin.update(demoAdmin.id, change, admin.headers);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "DEMO_ACCOUNT_PROTECTED", message: "Demo accounts can't be deactivated or have their role changed" },
    });
    expect(await stored(demoAdmin.id)).toEqual({ role: "ADMIN", isActive: true });
  });

  it("refuses to deactivate a demo moderator", async () => {
    const admin = await createAccount("ADMIN");
    const demoMod = await createAccount("MODERATOR", { isDemo: true });
    expect(await errorCode(await api.admin.update(demoMod.id, { isActive: false }, admin.headers))).toBe(
      "DEMO_ACCOUNT_PROTECTED",
    );
    expect(await stored(demoMod.id)).toEqual({ role: "MODERATOR", isActive: true });
  });

  it("refuses a demo admin's attempt to demote or deactivate itself", async () => {
    await createAccount("ADMIN");
    const demoAdmin = await createAccount("ADMIN", { isDemo: true });
    for (const change of [{ role: "MODERATOR" }, { isActive: false }]) {
      expect((await api.admin.update(demoAdmin.id, change, demoAdmin.headers)).status).toBe(403);
    }
    expect(await stored(demoAdmin.id)).toEqual({ role: "ADMIN", isActive: true });
  });

  it("allows no-op updates, which change nothing", async () => {
    const admin = await createAccount("ADMIN");
    const demoMod = await createAccount("MODERATOR", { isDemo: true });
    expect((await api.admin.update(demoMod.id, { role: "MODERATOR", isActive: true }, admin.headers)).status).toBe(200);
  });

  it("still lets a real admin manage real accounts", async () => {
    const admin = await createAccount("ADMIN");
    await createAccount("ADMIN", { isDemo: true });
    const mod = await createAccount("MODERATOR");
    expect((await api.admin.update(mod.id, { isActive: false }, admin.headers)).status).toBe(200);
  });
});

describe("the daily cron", () => {
  const runCron = () =>
    cleanup(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));

  it("re-asserts that every demo account is active with its original role, and touches nothing else", async () => {
    const ids = await seedDemoAccounts({ admin: "demo-admin-pass-1", aria: "demo-aria-pass-1", kiran: "demo-kiran-pass-1" });
    const real = await createAccount("MODERATOR");
    // Tampered with outside the API, e.g. directly in the database.
    await prisma.moderator.update({ where: { id: ids.admin }, data: { role: "MODERATOR", isActive: false } });
    await prisma.moderator.update({ where: { id: ids.aria }, data: { role: "ADMIN" } });
    await prisma.moderator.update({ where: { id: ids.kiran }, data: { isActive: false } });
    await prisma.moderator.update({ where: { id: real.id }, data: { isActive: false } });

    const res = await runCron();
    expect(res.status).toBe(200);
    expect((await res.json()).demoAccountsReset).toBe(3);

    for (const key of ["admin", "aria", "kiran"] as const) {
      expect(await stored(ids[key])).toEqual({ role: DEMO_ACCOUNTS[key].role, isActive: true });
    }
    expect(await stored(real.id)).toEqual({ role: "MODERATOR", isActive: false });
  });

  it("only restores accounts flagged as demo, even if one has a demo email", async () => {
    const impostor = await prisma.moderator.create({
      data: { email: DEMO_ACCOUNTS.admin.email, role: "MODERATOR", isActive: false, passwordHash: "x" },
    });
    expect(await reassertDemoAccounts()).toBe(0);
    expect(await stored(impostor.id)).toEqual({ role: "MODERATOR", isActive: false });
  });
});

describe("demo seed", () => {
  const passwords = { admin: "demo-admin-pass-1", aria: "demo-aria-pass-1", kiran: "demo-kiran-pass-1" };

  it("creates the demo accounts and sample cases once, and is idempotent", async () => {
    const ids = await seedDemoAccounts(passwords);
    const first = await seedDemoCases(ids);
    expect(first.every((c) => c.created)).toBe(true);
    const counts = async () => ({
      moderators: await prisma.moderator.count(),
      reports: await prisma.report.count(),
      messages: await prisma.caseMessage.count(),
      notes: await prisma.internalNote.count(),
      updates: await prisma.statusUpdate.count(),
    });
    const before = await counts();
    expect(before.moderators).toBe(3);
    expect(before.reports).toBe(DEMO_CASES.length);

    // Tamper with an account, then re-run: restored, nothing duplicated.
    await prisma.moderator.update({ where: { id: ids.aria }, data: { isActive: false } });
    const again = await seedDemoCases(await seedDemoAccounts(passwords));
    expect(again.every((c) => !c.created)).toBe(true);
    expect(await counts()).toEqual(before);
    expect(await stored(ids.aria)).toEqual({ role: "MODERATOR", isActive: true });

    const accounts = await prisma.moderator.findMany({ select: { email: true, role: true, isDemo: true } });
    expect(accounts.sort((a, b) => a.email.localeCompare(b.email))).toEqual([
      { email: "admin@whistledrop.demo", role: "ADMIN", isDemo: true },
      { email: "aria@whistledrop.demo", role: "MODERATOR", isDemo: true },
      { email: "kiran@whistledrop.demo", role: "MODERATOR", isDemo: true },
    ]);
    await expect(authHeaders("aria@whistledrop.demo", passwords.aria)).resolves.toBeDefined();
  });

  it("covers a mix of statuses, an ongoing conversation and a readable CLOSED conversation", async () => {
    const cases = await seedDemoCases(await seedDemoAccounts(passwords));
    expect(new Set(cases.map((c) => c.status))).toEqual(
      new Set(["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED", "CLOSED"]),
    );

    const ongoing = await (await api.lookupByBody({ caseCode: "WD-DEMO-0001" })).json();
    expect(ongoing.status).toBe("UNDER_REVIEW");
    expect(ongoing.conversation.at(-1)).toMatchObject({ type: "message", author: "REPORTER" });
    // Only the ongoing case waits for a reply.
    const waiting = await prisma.report.findMany({ where: { awaitingReply: true }, select: { caseCode: true } });
    expect(waiting).toEqual([{ caseCode: "WD-DEMO-0001" }]);

    const closedRes = await api.lookupByBody({ caseCode: "WD-DEMO-0003" });
    const closedText = await closedRes.text();
    const closed = JSON.parse(closedText);
    expect(closed.status).toBe("CLOSED");
    expect(closed.conversation.filter((c: { type: string }) => c.type === "message").length).toBeGreaterThanOrEqual(3);
    expect(closed.conversation.at(-1)).toMatchObject({ type: "status", status: "CLOSED" });
    // Internal notes and moderator identities stay out of the public view.
    expect(closedText).not.toMatch(/whistledrop\.demo|HR informed/);

    const reply = await api.reporterMessage({ caseCode: "WD-DEMO-0003", body: "Thanks" });
    expect(reply.status).toBe(423);
  });
});

describe("seed:demo guard", () => {
  it("refuses unless DEMO_MODE is true or --force is passed", () => {
    vi.stubEnv("DEMO_MODE", "false");
    expect(() => assertDemoSeedAllowed([])).toThrow(/DEMO_MODE is not true/);
    expect(() => assertDemoSeedAllowed(["--force"])).not.toThrow();
    vi.stubEnv("DEMO_MODE", "");
    expect(() => assertDemoSeedAllowed([])).toThrow(/--force/);
    vi.stubEnv("DEMO_MODE", "true");
    expect(() => assertDemoSeedAllowed([])).not.toThrow();
  });

  it("uses sample codes that a generated code can never equal (they contain 0 or 1)", () => {
    for (const { caseCode } of DEMO_CASES) expect(caseCode).toMatch(/^WD-DEMO-[0-9]{4}$/);
    for (const { caseCode } of DEMO_CASES) expect(caseCode.slice(3)).toMatch(/[01]/);
  });
});

describe("DEMO_MODE daily cleanup", () => {
  const passwords = { admin: "demo-admin-pass-1", aria: "demo-aria-pass-1", kiran: "demo-kiran-pass-1" };
  const DAY = 24 * 60 * 60 * 1000;
  const runCron = async () => {
    const res = await cleanup(
      new Request("http://localhost/api/cron/cleanup", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
    );
    expect(res.status).toBe(200);
    return res.json();
  };

  /** Everything that makes up a case's content, without ids or timestamps. */
  async function snapshot(caseCode: string) {
    const report = await prisma.report.findUnique({
      where: { caseCode },
      include: {
        statusUpdates: { orderBy: { createdAt: "asc" }, include: { moderator: { select: { email: true } } } },
        messages: { orderBy: { createdAt: "asc" }, include: { moderator: { select: { email: true } } } },
        internalNotes: { orderBy: { createdAt: "asc" }, include: { moderator: { select: { email: true } } } },
      },
    });
    if (!report) return null;
    return {
      category: report.category,
      description: report.description,
      status: report.status,
      awaitingReply: report.awaitingReply,
      closed: report.closedAt !== null,
      updates: report.statusUpdates.map((u) => [u.newStatus, u.note, u.visibility, u.moderator?.email]),
      messages: report.messages.map((m) => [m.authorType, m.body, m.moderator?.email]),
      notes: report.internalNotes.map((n) => [n.body, n.moderator.email]),
    };
  }
  const snapshotAll = async () => Promise.all(DEMO_CASES.map((c) => snapshot(c.caseCode)));

  /** A visitor's report from `ageMs` ago, with a message, an internal note and two evidence files. */
  async function visitorReport(ageMs: number) {
    const image = await uploadFile(await imageWithExif("jpeg"), "image/jpeg");
    const pdf = await uploadFile(tinyPdf(), "application/pdf");
    const { id, caseCode } = await createReport({ attachments: [image.uploadToken, pdf.uploadToken] });
    await api.reporterMessage({ caseCode, body: "Visitor message" });
    const mod = await prisma.moderator.findFirstOrThrow({ where: { email: DEMO_ACCOUNTS.aria.email } });
    await prisma.internalNote.create({ data: { reportId: id, moderatorId: mod.id, body: "Visitor note" } });
    await prisma.report.update({ where: { id }, data: { createdAt: new Date(Date.now() - ageMs) } });
    return { id, caseCode };
  }

  async function seedEverything() {
    await seedDemoCases(await seedDemoAccounts(passwords));
    return snapshotAll();
  }

  it("deletes non-sample reports older than 24 hours with their messages, notes and evidence, and keeps newer ones", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await seedEverything();
    const old = await visitorReport(DAY + 60_000);
    const recent = await visitorReport(DAY - 60_000);
    expect(pathsUnder(`reports/${old.id}/`)).toHaveLength(2);

    const body = await runCron();
    expect(body).toMatchObject({ demoReportsDeleted: 1, demoSamplesReset: DEMO_CASES.length });

    expect(await prisma.report.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.caseMessage.count({ where: { reportId: old.id } })).toBe(0);
    expect(await prisma.internalNote.count({ where: { reportId: old.id } })).toBe(0);
    expect(await prisma.attachment.count({ where: { reportId: old.id } })).toBe(0);
    expect(await prisma.statusUpdate.count({ where: { reportId: old.id } })).toBe(0);
    expect(pathsUnder(`reports/${old.id}/`)).toEqual([]);
    expect((await api.lookupByBody({ caseCode: old.caseCode })).status).toBe(404);

    expect(await prisma.report.findUnique({ where: { id: recent.id } })).not.toBeNull();
    expect(pathsUnder(`reports/${recent.id}/`)).toHaveLength(2);
    // The demo accounts that wrote on deleted reports are untouched.
    expect(await prisma.moderator.count({ where: { isDemo: true } })).toBe(3);
  });

  it("resets every sample case to its seeded state, however visitors changed it", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const seeded = await seedEverything();
    const aria = await authHeaders(DEMO_ACCOUNTS.aria.email, passwords.aria);

    await api.reporterMessage({ caseCode: "WD-DEMO-0001", body: "Visitor reply" });
    const submitted = await prisma.report.findUniqueOrThrow({ where: { caseCode: "WD-DEMO-0004" } });
    await api.patch(submitted.id, { newStatus: "UNDER_REVIEW", note: "Visitor note" }, aria);
    await api.note(submitted.id, { body: "Visitor internal note" }, aria);
    const resolved = await prisma.report.findUniqueOrThrow({ where: { caseCode: "WD-DEMO-0002" } });
    await api.patch(resolved.id, { newStatus: "CLOSED" }, aria);
    await prisma.report.delete({ where: { caseCode: "WD-DEMO-0005" } }); // even a missing one comes back
    expect(await snapshotAll()).not.toEqual(seeded);

    expect((await runCron()).demoSamplesReset).toBe(DEMO_CASES.length);
    expect(await snapshotAll()).toEqual(seeded);
    expect(await prisma.report.count()).toBe(DEMO_CASES.length);

    // And again: the reset is repeatable.
    await runCron();
    expect(await snapshotAll()).toEqual(seeded);
  });

  it("does none of this when DEMO_MODE is false", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    await seedEverything();
    const old = await visitorReport(3 * DAY);
    await api.reporterMessage({ caseCode: "WD-DEMO-0001", body: "Visitor reply" });
    const before = await snapshotAll();

    expect(await runCron()).toMatchObject({ demoReportsDeleted: 0, demoSamplesReset: 0 });
    expect(await prisma.report.findUnique({ where: { id: old.id } })).not.toBeNull();
    expect(pathsUnder(`reports/${old.id}/`)).toHaveLength(2);
    expect(await snapshotAll()).toEqual(before);
  });

  it("leaves the sample cases alone if the demo accounts are missing", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const ids = await seedDemoAccounts(passwords);
    await seedDemoCases(ids);
    await prisma.moderator.update({ where: { id: ids.kiran }, data: { isDemo: false } });
    const before = await snapshotAll();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resetDemoCases()).toBe(0);
    errorLog.mockRestore();
    expect(await snapshotAll()).toEqual(before);
  });

  it("fails closed with 500 on an invalid DEMO_MODE value, deleting nothing", async () => {
    await seedEverything();
    const old = await visitorReport(3 * DAY);
    vi.stubEnv("DEMO_MODE", "yes");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cleanup(
      new Request("http://localhost/api/cron/cleanup", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
    );
    errorLog.mockRestore();
    expect(res.status).toBe(500);
    expect(await prisma.report.findUnique({ where: { id: old.id } })).not.toBeNull();
  });
});
