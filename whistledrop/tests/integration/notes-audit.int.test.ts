import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetRateLimitsForTests } from "@/lib/rateLimit";
import { resetFakeStorage } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";
import { api, createAccount, createReport } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  resetFakeStorage();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PUBLIC vs INTERNAL notes", () => {
  it("shows reporters only PUBLIC updates, and moderators every update with its visibility", async () => {
    const mod = await createAccount("MODERATOR");
    const { id, caseCode } = await createReport();
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "We are looking into this" }, mod.headers);
    await api.patch(id, { newStatus: "RESOLVED", note: "Suspect: J. Smith in finance", visibility: "INTERNAL" }, mod.headers);
    await api.patch(id, { newStatus: "CLOSED", note: "Thank you for reporting", visibility: "PUBLIC" }, mod.headers);

    const publicView = await (await api.lookup(caseCode)).json();
    expect(publicView.status).toBe("CLOSED");
    expect(publicView.statusUpdates).toEqual([
      { note: "We are looking into this", newStatus: "UNDER_REVIEW", createdAt: expect.any(String) },
      { note: "Thank you for reporting", newStatus: "CLOSED", createdAt: expect.any(String) },
    ]);
    expect(JSON.stringify(publicView)).not.toContain("J. Smith");

    const modView = await (await api.get(id, mod.headers)).json();
    expect(modView.statusUpdates.map((u: { newStatus: string; visibility: string }) => [u.newStatus, u.visibility])).toEqual([
      ["UNDER_REVIEW", "PUBLIC"],
      ["RESOLVED", "INTERNAL"],
      ["CLOSED", "PUBLIC"],
    ]);
  });

  it("defaults to PUBLIC when visibility is omitted", async () => {
    const mod = await createAccount("MODERATOR");
    const { id } = await createReport();
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Hello" }, mod.headers);
    expect(await prisma.statusUpdate.findFirstOrThrow({ where: { reportId: id } })).toMatchObject({ visibility: "PUBLIC" });
  });

  it("rejects an unknown visibility with 400", async () => {
    const mod = await createAccount("MODERATOR");
    const { id } = await createReport();
    const res = await api.patch(id, { newStatus: "UNDER_REVIEW", visibility: "SECRET" }, mod.headers);
    expect(res.status).toBe(400);
    expect(await prisma.statusUpdate.count()).toBe(0);
  });
});

describe("moderator audit trail", () => {
  it("records the acting moderator on every status update", async () => {
    const alice = await createAccount("MODERATOR");
    const bob = await createAccount("ADMIN");
    const { id } = await createReport();
    await api.patch(id, { newStatus: "UNDER_REVIEW" }, alice.headers);
    await api.patch(id, { newStatus: "DISMISSED" }, bob.headers);

    const rows = await prisma.statusUpdate.findMany({ where: { reportId: id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.moderatorId)).toEqual([alice.id, bob.id]);
  });

  it("shows which moderator made each update in the moderator report detail", async () => {
    const alice = await createAccount("MODERATOR");
    const { id } = await createReport();
    const res = await api.patch(id, { newStatus: "UNDER_REVIEW", visibility: "INTERNAL", note: "Mine" }, alice.headers);

    expect((await res.json()).statusUpdates).toEqual([
      expect.objectContaining({ moderatorId: alice.id, moderator: { id: alice.id, email: alice.email } }),
    ]);
    const detail = await (await api.get(id, alice.headers)).json();
    expect(detail.statusUpdates[0].moderator).toEqual({ id: alice.id, email: alice.email });
    expect(JSON.stringify(detail)).not.toContain("passwordHash");
  });

  it("never exposes moderatorId or moderator details through the public lookup", async () => {
    const alice = await createAccount("MODERATOR");
    const { id, caseCode } = await createReport();
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Public note" }, alice.headers);

    const text = await (await api.lookup(caseCode)).text();
    expect(text).not.toContain(alice.id);
    expect(text).not.toContain(alice.email);
    expect(text).not.toMatch(/moderator|visibility|"id"/i);
  });

  it("keeps updates written before the audit trail existed (no moderator) valid", async () => {
    const mod = await createAccount("MODERATOR");
    const { id, caseCode } = await createReport();
    await prisma.statusUpdate.create({ data: { reportId: id, newStatus: "SUBMITTED", note: "Legacy row" } });

    const detail = await (await api.get(id, mod.headers)).json();
    expect(detail.statusUpdates).toEqual([
      expect.objectContaining({ note: "Legacy row", moderatorId: null, moderator: null, visibility: "PUBLIC" }),
    ]);
    expect((await (await api.lookup(caseCode)).json()).statusUpdates).toHaveLength(1);
  });

  it("prevents deleting a moderator who has history, so the trail can't be erased", async () => {
    const alice = await createAccount("MODERATOR");
    const { id } = await createReport();
    await api.patch(id, { newStatus: "UNDER_REVIEW" }, alice.headers);
    await expect(prisma.moderator.delete({ where: { id: alice.id } })).rejects.toThrow();
  });
});
