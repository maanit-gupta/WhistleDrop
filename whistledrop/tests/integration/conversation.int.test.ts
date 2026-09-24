import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { RATE_LIMITS, resetRateLimitsForTests } from "@/lib/rateLimit";
import { resetFakeStorage } from "../helpers/fakeStorage";
import { resetDatabase } from "./db";
import { api, createAccount, createReport, moveThrough } from "./api";

vi.mock("@/lib/storage", () => import("../helpers/fakeStorage"));

type Account = Awaited<ReturnType<typeof createAccount>>;
let mod: Account;

beforeEach(async () => {
  await resetDatabase();
  resetRateLimitsForTests();
  resetFakeStorage();
  mod = await createAccount("MODERATOR");
});

afterAll(async () => {
  await prisma.$disconnect();
});

const CLOSED_BODY = {
  error: { code: "REPORT_CLOSED", message: "This case is closed. The conversation is read-only." },
};
const NOT_FOUND_BODY = { error: { code: "NOT_FOUND", message: "Report not found" } };

const lookupJson = async (caseCode: string) => (await api.lookupByBody({ caseCode })).json();
const awaitingReply = async (id: string) =>
  (await prisma.report.findUniqueOrThrow({ where: { id }, select: { awaitingReply: true } })).awaitingReply;

describe("reporter messages", () => {
  it("lets the reporter post, returns 201 with the conversation, and shows the message in the lookup", async () => {
    const { caseCode } = await createReport();
    const res = await api.reporterMessage({ caseCode: caseCode.toLowerCase(), body: "  One more detail:\nit was Tuesday.  " });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const expected = [{ type: "message", author: "REPORTER", body: "One more detail:\nit was Tuesday.", createdAt: expect.any(String) }];
    expect(await res.json()).toEqual({ conversation: expected });

    expect((await lookupJson(caseCode)).conversation).toEqual(expected);
    expect((await (await api.lookup(caseCode)).json()).conversation).toEqual(expected);
  });

  it("stores the text and nothing about the sender", async () => {
    const { id, caseCode } = await createReport();
    await api.reporterMessage({ caseCode, body: "Hello" }, "203.0.113.77");

    const [row] = await prisma.caseMessage.findMany({ where: { reportId: id } });
    expect(Object.keys(row).sort()).toEqual(["authorType", "body", "createdAt", "id", "moderatorId", "reportId"]);
    expect(row).toMatchObject({ authorType: "REPORTER", moderatorId: null, body: "Hello" });
    expect(JSON.stringify(await prisma.report.findMany({ include: { messages: true } }))).not.toContain("203.0.113.77");
  });

  it.each([
    ["an empty body", { body: "" }],
    ["a whitespace-only body", { body: "   \n " }],
    ["a body over 2000 characters", { body: "a".repeat(2001) }],
    ["a missing body", {}],
    ["an extra field", { body: "Hi", moderatorId: "clx" }],
  ])("rejects %s with 400 and stores nothing", async (_label, extra) => {
    const { caseCode } = await createReport();
    const res = await api.reporterMessage({ caseCode, ...extra });
    expect(res.status).toBe(400);
    expect(await prisma.caseMessage.count()).toBe(0);
  });

  it("accepts exactly 2000 characters", async () => {
    const { caseCode } = await createReport();
    expect((await api.reporterMessage({ caseCode, body: "a".repeat(2000) })).status).toBe(201);
  });

  it("returns the lookup's identical 404 for unknown and malformed codes", async () => {
    await createReport();
    const lookup404 = await api.lookupByBody({ caseCode: "WD-ZZZZ-9999" });
    expect(lookup404.status).toBe(404);
    const expected = await lookup404.json();
    expect(expected).toEqual(NOT_FOUND_BODY);

    for (const caseCode of ["WD-ZZZZ-9999", "garbage", "WD-AAAA", ""]) {
      const res = await api.reporterMessage({ caseCode, body: "Hello?" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(expected);
    }
    expect(await prisma.caseMessage.count()).toBe(0);
  });

  it(`returns 429 after ${RATE_LIMITS.reporterMessage.limit} messages per hour for one IP and case`, async () => {
    const { caseCode } = await createReport();
    const other = await createReport();
    for (let i = 0; i < RATE_LIMITS.reporterMessage.limit; i++) {
      expect((await api.reporterMessage({ caseCode, body: `Message ${i}` })).status).toBe(201);
    }
    const limited = await api.reporterMessage({ caseCode, body: "One too many" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
    });
    expect(await prisma.caseMessage.count({ where: { body: "One too many" } })).toBe(0);

    // The bucket is per IP and case code.
    expect((await api.reporterMessage({ caseCode: other.caseCode, body: "Other case" })).status).toBe(201);
    expect((await api.reporterMessage({ caseCode, body: "Other network" }, "198.51.100.99")).status).toBe(201);
  });

  it("counts message attempts against the per-IP lookup budget, so it can't be used to guess codes", async () => {
    for (let i = 0; i < RATE_LIMITS.lookup.limit; i++) {
      expect((await api.reporterMessage({ caseCode: `WD-GUES-${String(i).padStart(4, "0")}`, body: "?" })).status).toBe(404);
    }
    expect((await api.reporterMessage({ caseCode: "WD-GUES-9999", body: "?" })).status).toBe(429);
    expect((await api.lookupByBody({ caseCode: "WD-GUES-9999" })).status).toBe(429);
  });
});

describe("POST /api/reports/lookup", () => {
  it("returns exactly what GET /api/reports/{caseCode} returns", async () => {
    const { id, caseCode } = await createReport();
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Started" }, mod.headers);
    await api.moderatorMessage(id, { body: "Thanks" }, mod.headers);

    const viaGet = await api.lookup(caseCode);
    const viaPost = await api.lookupByBody({ caseCode: ` ${caseCode.toLowerCase()} ` });
    expect(viaPost.status).toBe(200);
    expect(await viaPost.json()).toEqual(await viaGet.json());
  });

  it("gives unknown and malformed codes the GET route's 404, and rejects a non-string with 400", async () => {
    const viaGet = await (await api.lookup("WD-ZZZZ-9999")).json();
    for (const caseCode of ["WD-ZZZZ-9999", "nope"]) {
      const res = await api.lookupByBody({ caseCode });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(viaGet);
    }
    expect((await api.lookupByBody({ caseCode: 42 })).status).toBe(400);
    expect((await api.lookupByBody("{")).status).toBe(400);
  });
});

describe("moderator replies", () => {
  it("never exposes the moderator's identity to the reporter", async () => {
    const { id, caseCode } = await createReport();
    const res = await api.moderatorMessage(id, { body: "Could you tell us which building?" }, mod.headers);
    expect(res.status).toBe(201);
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Looking" }, mod.headers);

    const sent = await api.reporterMessage({ caseCode, body: "Building B." });
    const lookup = await api.lookupByBody({ caseCode });
    for (const text of [await sent.text(), await lookup.text()]) {
      expect(text).toContain("REVIEW_TEAM");
      expect(text).not.toContain(mod.id);
      expect(text).not.toContain(mod.email);
      expect(text).not.toContain(id);
      expect(text).not.toMatch(/moderator|visibility|"id"|MODERATOR/i);
    }
  });

  it("shows moderators who wrote each entry, for accountability", async () => {
    const other = await createAccount("ADMIN");
    const { id, caseCode } = await createReport();
    await api.moderatorMessage(id, { body: "First question" }, mod.headers);
    await api.reporterMessage({ caseCode, body: "Answer" });
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "Public note" }, other.headers);

    const { conversation } = await (await api.get(id, mod.headers)).json();
    expect(conversation).toEqual([
      expect.objectContaining({ type: "message", author: "REVIEW_TEAM", body: "First question", moderator: { id: mod.id, email: mod.email } }),
      expect.objectContaining({ type: "message", author: "REPORTER", body: "Answer", moderator: null }),
      expect.objectContaining({ type: "status", status: "UNDER_REVIEW", note: "Public note", moderator: { id: other.id, email: other.email } }),
    ]);
  });

  it.each([
    ["an empty body", { body: " " }],
    ["a body over 2000 characters", { body: "a".repeat(2001) }],
    ["an extra field", { body: "Hi", visibility: "PUBLIC" }],
  ])("rejects %s with 400", async (_label, body) => {
    const { id } = await createReport();
    expect((await api.moderatorMessage(id, body, mod.headers)).status).toBe(400);
    expect(await prisma.caseMessage.count()).toBe(0);
  });

  it("returns 404 for an unknown report", async () => {
    expect((await api.moderatorMessage("clnobody00000000000000001", { body: "Hi" }, mod.headers)).status).toBe(404);
  });

  it("refuses a REPORTER message that names a moderator at the database level", async () => {
    const { id } = await createReport();
    await expect(
      prisma.caseMessage.create({ data: { reportId: id, authorType: "REPORTER", moderatorId: mod.id, body: "x" } }),
    ).rejects.toThrow();
    await expect(prisma.caseMessage.create({ data: { reportId: id, authorType: "MODERATOR", body: "x" } })).rejects.toThrow();
  });
});

describe("INTERNAL notes", () => {
  it("are never present in the lookup or the conversation", async () => {
    const { id, caseCode } = await createReport();
    await api.note(id, { body: "SECRET-NOTE suspect is in finance" }, mod.headers);
    await api.patch(id, { newStatus: "UNDER_REVIEW", note: "SECRET-STATUS-NOTE", visibility: "INTERNAL" }, mod.headers);
    await api.moderatorMessage(id, { body: "Visible reply" }, mod.headers);

    for (const res of [await api.lookupByBody({ caseCode }), await api.lookup(caseCode)]) {
      const text = await res.text();
      expect(text).not.toContain("SECRET");
      const { conversation } = JSON.parse(text);
      // The INTERNAL status change itself is still shown, without its note.
      expect(conversation).toEqual([
        { type: "status", status: "UNDER_REVIEW", createdAt: expect.any(String) },
        { type: "message", author: "REVIEW_TEAM", body: "Visible reply", createdAt: expect.any(String) },
      ]);
    }
    const sent = await api.reporterMessage({ caseCode, body: "Thanks" });
    expect(await sent.text()).not.toContain("SECRET");

    const detail = await (await api.get(id, mod.headers)).json();
    expect(JSON.stringify(detail.conversation)).not.toContain("SECRET");
    expect(detail.internalNotes).toEqual([
      expect.objectContaining({ type: "note", note: "SECRET-NOTE suspect is in finance", moderator: { id: mod.id, email: mod.email } }),
      expect.objectContaining({ type: "status", status: "UNDER_REVIEW", note: "SECRET-STATUS-NOTE" }),
    ]);
  });

  it("has no visibility option: the notes endpoint rejects one with 400", async () => {
    const { id } = await createReport();
    const res = await api.note(id, { body: "Meant for the reporter", visibility: "PUBLIC" }, mod.headers);
    expect(res.status).toBe(400);
    expect(await prisma.internalNote.count()).toBe(0);
  });

  it("returns 201 with the updated report and leaves awaitingReply alone", async () => {
    const { id, caseCode } = await createReport();
    await api.reporterMessage({ caseCode, body: "Any news?" });
    const res = await api.note(id, { body: "Asked legal" }, mod.headers);
    expect(res.status).toBe(201);
    expect((await res.json()).internalNotes).toHaveLength(1);
    expect(await awaitingReply(id)).toBe(true);
  });
});

describe("awaitingReply", () => {
  it("is set by a reporter message, cleared by a reply, set again, and cleared on close", async () => {
    const { id, caseCode } = await createReport();
    expect(await awaitingReply(id)).toBe(false);

    await api.reporterMessage({ caseCode, body: "Hello" });
    expect(await awaitingReply(id)).toBe(true);

    const replied = await api.moderatorMessage(id, { body: "Hi" }, mod.headers);
    expect((await replied.json()).awaitingReply).toBe(false);
    expect(await awaitingReply(id)).toBe(false);

    await api.reporterMessage({ caseCode, body: "Another thing" });
    expect(await awaitingReply(id)).toBe(true);

    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED", "CLOSED"], mod.headers);
    expect(await awaitingReply(id)).toBe(false);
  });

  it("filters the reports list and is included in each item", async () => {
    const waiting = await createReport();
    const answered = await createReport();
    await createReport();
    await api.reporterMessage({ caseCode: waiting.caseCode, body: "Hello" });
    await api.reporterMessage({ caseCode: answered.caseCode, body: "Hello" });
    await api.moderatorMessage(answered.id, { body: "Hi" }, mod.headers);

    const onlyWaiting = await (await api.list(mod.headers, "?awaitingReply=true")).json();
    expect(onlyWaiting.items.map((r: { caseCode: string }) => r.caseCode)).toEqual([waiting.caseCode]);
    expect(onlyWaiting.items[0].awaitingReply).toBe(true);

    const rest = await (await api.list(mod.headers, "?awaitingReply=false")).json();
    expect(rest.total).toBe(2);
    expect(rest.items.every((r: { awaitingReply: boolean }) => r.awaitingReply === false)).toBe(true);
  });
});

describe("a CLOSED case's conversation", () => {
  async function closedCaseWithConversation() {
    const { id, caseCode } = await createReport();
    await api.moderatorMessage(id, { body: "Can you confirm the date?" }, mod.headers);
    await api.reporterMessage({ caseCode, body: "It was the 3rd." });
    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED"], mod.headers);
    await api.patch(id, { newStatus: "CLOSED", note: "Thank you. This case is now closed." }, mod.headers);
    return { id, caseCode };
  }

  it("stays readable by the reporter, in full", async () => {
    const { caseCode } = await closedCaseWithConversation();
    const res = await api.lookupByBody({ caseCode });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("CLOSED");
    expect(body.conversation).toEqual([
      expect.objectContaining({ type: "message", author: "REVIEW_TEAM", body: "Can you confirm the date?" }),
      expect.objectContaining({ type: "message", author: "REPORTER", body: "It was the 3rd." }),
      expect.objectContaining({ type: "status", status: "UNDER_REVIEW" }),
      expect.objectContaining({ type: "status", status: "RESOLVED" }),
      expect.objectContaining({ type: "status", status: "CLOSED", note: "Thank you. This case is now closed." }),
    ]);
  });

  it("returns 423 to the reporter and to moderators, and adds nothing", async () => {
    const { id, caseCode } = await closedCaseWithConversation();
    const admin = await createAccount("ADMIN");
    const before = await prisma.caseMessage.count();

    const reporter = await api.reporterMessage({ caseCode, body: "One more thing" });
    expect(reporter.status).toBe(423);
    expect(await reporter.json()).toEqual(CLOSED_BODY);

    for (const headers of [mod.headers, admin.headers]) {
      const reply = await api.moderatorMessage(id, { body: "Late reply" }, headers);
      expect(reply.status).toBe(423);
      expect(await reply.json()).toEqual(CLOSED_BODY);
      expect((await api.note(id, { body: "Late note" }, headers)).status).toBe(423);
    }

    expect(await prisma.caseMessage.count()).toBe(before);
    expect(await prisma.internalNote.count()).toBe(0);
    expect(await awaitingReply(id)).toBe(false);
  });

  it("can't be written to by a message racing the close", async () => {
    const { id, caseCode } = await createReport();
    await moveThrough(id, ["UNDER_REVIEW", "RESOLVED"], mod.headers);
    const [close, message] = await Promise.all([
      api.patch(id, { newStatus: "CLOSED" }, mod.headers),
      api.reporterMessage({ caseCode, body: "Racing" }),
    ]);
    expect(close.status).toBe(200);
    const report = await prisma.report.findUniqueOrThrow({ where: { id }, include: { messages: true } });
    if (message.status === 201) {
      // The message committed first; the close then cleared awaitingReply.
      expect(report.messages).toHaveLength(1);
    } else {
      expect(message.status).toBe(423);
      expect(report.messages).toHaveLength(0);
    }
    expect(report.awaitingReply).toBe(false);
  });
});
