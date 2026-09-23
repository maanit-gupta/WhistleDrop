import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signModeratorToken } from "@/lib/auth";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import { resetDatabase } from "./db";
import { api, authHeaders, createAccount, createReport } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Polls Postgres until `count` other sessions are waiting on a row lock. */
async function waitForLockWaiters(count: number) {
  for (let i = 0; i < 200; i++) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (waiting >= count) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for ${count} lock waiters`);
}

const newModerator = { email: "New.Mod@Example.com", password: "a-long-enough-password" };

describe("role enforcement", () => {
  it("returns 403 to a MODERATOR on every admin route and changes nothing", async () => {
    const mod = await createAccount("MODERATOR");
    const other = await createAccount("MODERATOR");

    const responses = [
      await api.admin.list(mod.headers),
      await api.admin.create(newModerator, mod.headers),
      await api.admin.update(other.id, { role: "ADMIN" }, mod.headers),
      await api.admin.update(mod.id, { role: "ADMIN" }, mod.headers),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Administrator access required" } });
    }
    expect(await prisma.moderator.count()).toBe(2);
    expect(await prisma.moderator.findMany({ where: { role: "ADMIN" } })).toEqual([]);
  });

  it("uses the role in the database, not the one in the token", async () => {
    const mod = await createAccount("MODERATOR");
    const forged = await signModeratorToken({ sub: mod.id, email: mod.email, role: "ADMIN" });
    expect((await api.admin.list({ authorization: `Bearer ${forged}` })).status).toBe(403);
  });

  it("lets MODERATOR and ADMIN both use the moderator routes", async () => {
    const mod = await createAccount("MODERATOR");
    const admin = await createAccount("ADMIN");
    const { id } = await createReport();
    expect((await api.patch(id, { newStatus: "UNDER_REVIEW" }, mod.headers)).status).toBe(200);
    expect((await api.patch(id, { newStatus: "RESOLVED" }, admin.headers)).status).toBe(200);
  });
});

describe("admin moderator management", () => {
  it("lists moderators without password hashes", async () => {
    const admin = await createAccount("ADMIN");
    await createAccount("MODERATOR");
    const res = await api.admin.list(admin.headers);
    expect(res.status).toBe(200);
    const { items } = await res.json();

    expect(items).toHaveLength(2);
    for (const m of items) expect(Object.keys(m).sort()).toEqual(["createdAt", "email", "id", "isActive", "role"]);
    expect(JSON.stringify(items)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("creates a MODERATOR by default who can then log in", async () => {
    const admin = await createAccount("ADMIN");
    const res = await api.admin.create(newModerator, admin.headers);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: expect.any(String),
      email: "new.mod@example.com",
      role: "MODERATOR",
      isActive: true,
      createdAt: expect.any(String),
    });
    await expect(authHeaders(newModerator.email, newModerator.password)).resolves.toBeDefined();
  });

  it("returns 409 for a duplicate email, ignoring case", async () => {
    const admin = await createAccount("ADMIN");
    await api.admin.create(newModerator, admin.headers);
    const res = await api.admin.create({ ...newModerator, email: "NEW.MOD@example.com" }, admin.headers);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EMAIL_TAKEN");
    expect(await prisma.moderator.count({ where: { email: "new.mod@example.com" } })).toBe(1);
  });

  it.each([
    ["a short password", { email: "a@example.com", password: "short" }],
    ["a password over 72 bytes", { email: "a@example.com", password: "é".repeat(37) }],
    ["an invalid role", { email: "a@example.com", password: "a-long-enough-password", role: "OWNER" }],
    ["an extra field", { email: "a@example.com", password: "a-long-enough-password", isActive: false }],
  ])("rejects %s with 400", async (_label, body) => {
    const admin = await createAccount("ADMIN");
    expect((await api.admin.create(body, admin.headers)).status).toBe(400);
  });

  it("changes another moderator's role and active status", async () => {
    const admin = await createAccount("ADMIN");
    const mod = await createAccount("MODERATOR");
    const promoted = await api.admin.update(mod.id, { role: "ADMIN" }, admin.headers);
    expect(await promoted.json()).toMatchObject({ id: mod.id, role: "ADMIN", isActive: true });

    const deactivated = await api.admin.update(mod.id, { isActive: false }, admin.headers);
    expect(await deactivated.json()).toMatchObject({ role: "ADMIN", isActive: false });
  });

  it("returns 404 for an unknown moderator and 400 for an empty change", async () => {
    const admin = await createAccount("ADMIN");
    expect((await api.admin.update("clnobody00000000000000001", { isActive: false }, admin.headers)).status).toBe(404);
    expect((await api.admin.update(admin.id, {}, admin.headers)).status).toBe(400);
  });
});

describe("deactivation and demotion take effect immediately", () => {
  it("rejects an existing token as soon as the account is deactivated, and blocks login", async () => {
    const admin = await createAccount("ADMIN");
    const mod = await createAccount("MODERATOR");
    expect((await api.list(mod.headers)).status).toBe(200);

    await api.admin.update(mod.id, { isActive: false }, admin.headers);
    expect((await api.list(mod.headers)).status).toBe(401);
    expect((await api.login({ email: mod.email, password: mod.password })).status).toBe(401);

    await api.admin.update(mod.id, { isActive: true }, admin.headers);
    expect((await api.list(mod.headers)).status).toBe(200);
  });

  it("removes admin access from a demoted admin's existing token", async () => {
    const admin = await createAccount("ADMIN");
    const other = await createAccount("ADMIN");
    expect((await api.admin.list(other.headers)).status).toBe(200);

    await api.admin.update(other.id, { role: "MODERATOR" }, admin.headers);
    expect((await api.admin.list(other.headers)).status).toBe(403);
    expect((await api.list(other.headers)).status).toBe(200);
  });
});

describe("admin self-protection and the last admin", () => {
  it.each([
    ["demote", { role: "MODERATOR" }],
    ["deactivate", { isActive: false }],
    ["demote and deactivate", { role: "MODERATOR", isActive: false }],
  ])("forbids an admin to %s themselves", async (_label, change) => {
    const admin = await createAccount("ADMIN");
    await createAccount("ADMIN"); // even when another admin exists
    const res = await api.admin.update(admin.id, change, admin.headers);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("CANNOT_MODIFY_SELF");
    expect(await prisma.moderator.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
      role: "ADMIN",
      isActive: true,
    });
  });

  it("allows harmless self-updates", async () => {
    const admin = await createAccount("ADMIN");
    expect((await api.admin.update(admin.id, { role: "ADMIN", isActive: true }, admin.headers)).status).toBe(200);
  });

  it.each([
    ["demote", { role: "MODERATOR" }],
    ["deactivate", { isActive: false }],
  ])(
    "returns 409 LAST_ADMIN when two admins %s each other at the same time, keeping one active admin",
    async (_label, change) => {
      const a = await createAccount("ADMIN");
      const b = await createAccount("ADMIN");

      // Make the race deterministic: hold the admin-row lock the route takes,
      // start both requests, wait until Postgres shows both blocked on it (so
      // both have passed their auth checks), then release.
      let requests: Promise<Response>[] = [];
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Moderator" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
          requests = [api.admin.update(b.id, change, a.headers), api.admin.update(a.id, change, b.headers)];
          await waitForLockWaiters(2);
        },
        { timeout: 15_000 },
      );
      const [resA, resB] = await Promise.all(requests);

      expect([resA.status, resB.status].sort()).toEqual([200, 409]);
      const loser = resA.status === 409 ? resA : resB;
      expect(await loser.json()).toEqual({
        error: { code: "LAST_ADMIN", message: "At least one active administrator must remain" },
      });
      expect(await prisma.moderator.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
    },
  );

  it("never leaves zero active admins even when the requests race freely", async () => {
    const a = await createAccount("ADMIN");
    const b = await createAccount("ADMIN");
    const results = await Promise.all([
      api.admin.update(b.id, { role: "MODERATOR" }, a.headers),
      api.admin.update(a.id, { role: "MODERATOR" }, b.headers),
    ]);
    // Depending on timing the loser is rejected by the last-admin rule (409) or,
    // if the other request already committed, because it is no longer an admin (403).
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.moderator.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
  });

  it("still allows demoting an admin while another active admin remains", async () => {
    const a = await createAccount("ADMIN");
    const b = await createAccount("ADMIN");
    await createAccount("ADMIN");
    expect((await api.admin.update(b.id, { role: "MODERATOR" }, a.headers)).status).toBe(200);
    expect(await prisma.moderator.count({ where: { role: "ADMIN", isActive: true } })).toBe(2);
  });
});
