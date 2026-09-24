import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import { DEMO_ACCOUNTS, DEMO_CASES, reassertDemoAccounts, seedDemoAccounts, seedDemoCases } from "@/lib/demo";
import { GET as cleanup } from "@/app/api/cron/cleanup/route";
import { resetFakeStorage } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";
import { api, authHeaders, createAccount } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  resetFakeStorage();
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
