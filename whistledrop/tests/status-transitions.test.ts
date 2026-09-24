import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportStatus } from "@prisma/client";

// In-memory stand-in for the Prisma calls made by the status route. Writes are
// only available on the transaction client, and $transaction restores the
// previous state if the callback throws, so the tests can tell whether all
// writes share one transaction.
const db = vi.hoisted(() => {
  type Update = {
    id: string;
    reportId: string;
    newStatus: string;
    note: string | null;
    visibility: string;
    moderatorId: string | null;
    createdAt: Date;
  };
  type Report = { id: string; status: string; closedAt: Date | null; updatedAt: Date };
  const state = {
    reports: new Map<string, Report>(),
    updates: [] as Update[],
    attachments: [] as { id: string; reportId: string; storagePath: string }[],
    beforeUpdate: null as null | (() => void),
    failStatusUpdateCreate: false,
  };
  const withHistory = (r: Report) => ({
    ...r,
    statusUpdates: state.updates.filter((u) => u.reportId === r.id),
    attachments: state.attachments.filter((a) => a.reportId === r.id),
    messages: [],
    internalNotes: [],
  });

  const tx = {
    report: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const r = state.reports.get(where.id);
        return r ? { status: r.status } : null;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const r = state.reports.get(where.id);
        if (!r) throw new Error("not found");
        return structuredClone(withHistory(r));
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; status: string }; data: { status: string; closedAt?: Date } }) => {
          state.beforeUpdate?.();
          const r = state.reports.get(where.id);
          if (!r || r.status !== where.status) return { count: 0 };
          Object.assign(r, data, { updatedAt: new Date() });
          return { count: 1 };
        },
      ),
    },
    statusUpdate: {
      create: vi.fn(
        async ({ data }: { data: { reportId: string; newStatus: string; note?: string; visibility?: string; moderatorId: string } }) => {
          if (state.failStatusUpdateCreate) throw new Error("insert failed");
          const row = {
            id: `clupdate${String(state.updates.length + 1).padStart(17, "0")}`,
            createdAt: new Date(),
            ...data,
            note: data.note ?? null,
            visibility: data.visibility ?? "PUBLIC",
          };
          state.updates.push(row);
          return row;
        },
      ),
    },
    attachment: {
      deleteMany: vi.fn(async ({ where }: { where: { reportId: string } }) => {
        state.attachments = state.attachments.filter((a) => a.reportId !== where.reportId);
      }),
    },
  };

  const prisma = {
    moderator: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "clmoderator00000000000001"
          ? { id: where.id, email: "mod@example.com", role: "MODERATOR", isActive: true }
          : null,
      ),
    },
    report: {
      // Read before the transaction: current status and attachment paths.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const r = state.reports.get(where.id);
        if (!r) return null;
        return {
          status: r.status,
          attachments: state.attachments.filter((a) => a.reportId === r.id).map((a) => ({ storagePath: a.storagePath })),
        };
      }),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
      const snapshot = structuredClone({ reports: state.reports, updates: state.updates, attachments: state.attachments });
      try {
        return await fn(tx);
      } catch (err) {
        Object.assign(state, snapshot);
        throw err;
      }
    }),
  };
  return { state, tx, prisma };
});

vi.mock("@/lib/db", () => ({ prisma: db.prisma }));
vi.mock("@/lib/storage", () => import("./helpers/fakeStorage"));

import { PATCH } from "@/app/api/mod/reports/[id]/status/route";
import { signModeratorToken } from "@/lib/auth";
import { ALLOWED_TRANSITIONS, isValidTransition, statusUpdateSchemaFor } from "@/lib/validation";
import { objects, resetFakeStorage, simulateBrowserUpload } from "./helpers/fakeStorage";

const REPORT_ID = "clreport00000000000000001";
const MODERATOR_ID = "clmoderator00000000000001";
const STATUSES: ReportStatus[] = ["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "DISMISSED", "CLOSED"];
const VALID: [ReportStatus, ReportStatus][] = [
  ["SUBMITTED", "UNDER_REVIEW"],
  ["UNDER_REVIEW", "RESOLVED"],
  ["UNDER_REVIEW", "DISMISSED"],
  ["RESOLVED", "CLOSED"],
  ["DISMISSED", "CLOSED"],
];
const ALL_PAIRS = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as [ReportStatus, ReportStatus]));
const INVALID = ALL_PAIRS.filter(([from, to]) => !VALID.some(([f, t]) => f === from && t === to));
const INVALID_FROM_OPEN = INVALID.filter(([from]) => from !== "CLOSED");
const FROM_CLOSED = INVALID.filter(([from]) => from === "CLOSED");

let token: string;

const seedReport = (status: ReportStatus) =>
  db.state.reports.set(REPORT_ID, { id: REPORT_ID, status, closedAt: null, updatedAt: new Date(0) });
const stored = () => ({
  status: db.state.reports.get(REPORT_ID)?.status,
  history: db.state.updates.map((u) => u.newStatus),
});

const patch = (body: unknown, id = REPORT_ID) =>
  PATCH(
    new Request(`http://localhost/api/mod/reports/${id}/status`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(async () => {
  db.state.reports = new Map();
  db.state.updates = [];
  db.state.attachments = [];
  db.state.beforeUpdate = null;
  db.state.failStatusUpdateCreate = false;
  resetFakeStorage();
  vi.clearAllMocks();
  token ??= await signModeratorToken({ sub: MODERATOR_ID, email: "mod@example.com", role: "MODERATOR" });
});

describe("transition rules", () => {
  it("allows exactly the five specified transitions", () => {
    const allowed = Object.entries(ALLOWED_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => [from, to]));
    expect(allowed).toEqual(VALID);
  });

  it.each(VALID)("isValidTransition(%s -> %s) is true", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
    expect(statusUpdateSchemaFor(from).safeParse({ newStatus: to }).success).toBe(true);
  });

  it.each(INVALID)("isValidTransition(%s -> %s) is false", (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
    expect(statusUpdateSchemaFor(from).safeParse({ newStatus: to }).success).toBe(false);
  });
});

describe("PATCH /api/mod/reports/:id/status", () => {
  it.each(VALID)("applies %s -> %s and returns the updated report", async (from, to) => {
    seedReport(from);
    const res = await patch({ newStatus: to, note: "  Reviewed by the security team  " });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({ id: REPORT_ID, status: to });
    expect(body.statusUpdates).toEqual([
      expect.objectContaining({ reportId: REPORT_ID, newStatus: to, note: "Reviewed by the security team" }),
    ]);
    expect(stored()).toEqual({ status: to, history: [to] });
  });

  it("writes the status and the StatusUpdate row (with visibility and acting moderator) in one transaction", async () => {
    seedReport("SUBMITTED");
    await patch({ newStatus: "UNDER_REVIEW", note: "Internal", visibility: "INTERNAL" });
    expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(db.tx.report.updateMany).toHaveBeenCalledWith({
      where: { id: REPORT_ID, status: "SUBMITTED" },
      data: { status: "UNDER_REVIEW" },
    });
    expect(db.tx.statusUpdate.create).toHaveBeenCalledWith({
      data: { reportId: REPORT_ID, newStatus: "UNDER_REVIEW", note: "Internal", visibility: "INTERNAL", moderatorId: MODERATOR_ID },
    });
  });

  it("sets closedAt, clears awaitingReply and purges attachments (storage objects and rows) when closing", async () => {
    seedReport("RESOLVED");
    db.state.attachments = [{ id: "clatt", reportId: REPORT_ID, storagePath: `reports/${REPORT_ID}/a.jpg` }];
    simulateBrowserUpload(`reports/${REPORT_ID}/a.jpg`, Buffer.from("img"));

    const res = await patch({ newStatus: "CLOSED" });
    expect(res.status).toBe(200);
    expect(db.tx.report.updateMany).toHaveBeenCalledWith({
      where: { id: REPORT_ID, status: "RESOLVED" },
      data: { status: "CLOSED", closedAt: expect.any(Date), awaitingReply: false },
    });
    expect(db.state.reports.get(REPORT_ID)!.closedAt).toBeInstanceOf(Date);
    expect(db.state.attachments).toEqual([]);
    expect(objects.size).toBe(0);
  });

  it("rolls back the status change if creating the StatusUpdate fails", async () => {
    seedReport("SUBMITTED");
    db.state.failStatusUpdateCreate = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await patch({ newStatus: "UNDER_REVIEW" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(stored()).toEqual({ status: "SUBMITTED", history: [] });
    errorLog.mockRestore();
  });

  it.each(INVALID_FROM_OPEN)("rejects %s -> %s with 409 and changes nothing", async (from, to) => {
    seedReport(from);
    const res = await patch({ newStatus: to });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_TRANSITION", message: `Cannot change status from ${from} to ${to}` },
    });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(stored()).toEqual({ status: from, history: [] });
  });

  it.each(FROM_CLOSED)("rejects %s -> %s with 423 Locked and changes nothing", async (from, to) => {
    seedReport(from);
    const res = await patch({ newStatus: to, note: "late note" });
    expect(res.status).toBe(423);
    expect((await res.json()).error.code).toBe("REPORT_CLOSED");
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(stored()).toEqual({ status: "CLOSED", history: [] });
  });

  it("walks the full lifecycle and keeps an ordered audit trail", async () => {
    seedReport("SUBMITTED");
    for (const s of ["UNDER_REVIEW", "RESOLVED", "CLOSED"]) expect((await patch({ newStatus: s })).status).toBe(200);
    expect((await patch({ newStatus: "UNDER_REVIEW" })).status).toBe(423);
    expect(stored()).toEqual({ status: "CLOSED", history: ["UNDER_REVIEW", "RESOLVED", "CLOSED"] });
  });

  it("returns 409 CONFLICT if another moderator changes the status mid-request", async () => {
    seedReport("UNDER_REVIEW");
    db.state.beforeUpdate = () => {
      db.state.reports.get(REPORT_ID)!.status = "DISMISSED";
    };
    const res = await patch({ newStatus: "RESOLVED" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
    expect(stored()).toEqual({ status: "DISMISSED", history: [] });
  });

  it("returns 423 if another moderator closes the report mid-request", async () => {
    seedReport("RESOLVED");
    db.state.beforeUpdate = () => {
      db.state.reports.get(REPORT_ID)!.status = "CLOSED";
    };
    expect((await patch({ newStatus: "CLOSED" })).status).toBe(423);
  });

  it("returns 404 for an unknown report", async () => {
    const res = await patch({ newStatus: "UNDER_REVIEW" }, "clmissing0000000000000001");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a malformed id without touching the database", async () => {
    const res = await patch({ newStatus: "UNDER_REVIEW" }, "../../etc");
    expect(res.status).toBe(404);
    expect(db.prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown status", { newStatus: "ARCHIVED" }],
    ["missing status", { note: "hi" }],
    ["lowercase status", { newStatus: "under_review" }],
    ["unknown visibility", { newStatus: "UNDER_REVIEW", visibility: "SECRET" }],
    ["note over 2000 characters", { newStatus: "UNDER_REVIEW", note: "a".repeat(2001) }],
    ["extra fields", { newStatus: "UNDER_REVIEW", moderatorId: "clother000000000000000001" }],
  ])("rejects %s with 400 before touching the report", async (_label, body) => {
    seedReport("SUBMITTED");
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(db.prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await patch("{");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
  });
});
