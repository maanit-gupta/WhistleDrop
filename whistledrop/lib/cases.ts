import "server-only";
import { Prisma, type NoteVisibility, type ReportCategory, type ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateCaseCode } from "@/lib/caseCode";
import { listObjects, removeObjects } from "@/lib/storage";
import { isValidTransition } from "@/lib/transitions.shared";
import { UploadError, newId, type StoredAttachment } from "@/lib/uploads";
import {
  moderatorReportDetail,
  publicCaseSelect,
  toModeratorDetail,
  toPublicCase,
  type ModeratorReportDetail,
  type PublicCase,
} from "@/lib/reports";

// The case workflow, shared by the route handlers and prisma/seed-demo.ts, so
// sample data goes through exactly the rules real requests do. Nothing here
// knows about HTTP: each function returns a result the route maps to a status.
//
// PRIVACY: none of these functions accepts anything about the reporter beyond
// the report's own content and the case code.

const MAX_CREATE_ATTEMPTS = 3;

// Prisma's defaults (2s to acquire a connection, 5s total) are too tight when the
// app and database are far apart or a new pooled connection must be opened.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

const isUniqueViolationOn = (err: unknown, field: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError &&
  err.code === "P2002" &&
  JSON.stringify(err.meta?.target ?? "").includes(field);

// ── Reports ──────────────────────────────────────────────────────────────

export interface NewReport {
  category: ReportCategory;
  description: string;
  evidenceUrl?: string;
}

export interface CreateReportOptions {
  /** Pre-allocated id, when attachments were already stored under reports/<id>/. */
  id?: string;
  /** Attachments already validated and stored for this report. */
  attachments?: StoredAttachment[];
  /** Upload-token ids to mark as used in the same transaction. */
  consumedTokenIds?: string[];
  /** Fixed case code (demo data only). Without it a random one is generated. */
  caseCode?: string;
}

/**
 * Creates a report, its attachment rows and the token consumption in one
 * transaction: afterwards they all exist or none do. Throws
 * UploadError("UPLOAD_TOKEN_USED") if a concurrent submission used a token first.
 */
export async function createReport(
  report: NewReport,
  { id = newId(), attachments = [], consumedTokenIds = [], caseCode: fixedCode }: CreateReportOptions = {},
): Promise<{ id: string; caseCode: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const caseCode = fixedCode ?? (await generateCaseCode());
      await prisma.$transaction([
        prisma.report.create({ data: { id, ...report, caseCode } }),
        prisma.consumedUploadToken.createMany({ data: consumedTokenIds.map((jti) => ({ jti })) }),
        prisma.attachment.createMany({ data: attachments.map((a) => ({ ...a, reportId: id })) }),
      ]);
      return { id, caseCode };
    } catch (err) {
      if (isUniqueViolationOn(err, "jti")) {
        throw new UploadError("UPLOAD_TOKEN_USED", "Upload token has already been used");
      }
      // Another request claimed the same case code between check and insert.
      if (fixedCode || !isUniqueViolationOn(err, "caseCode") || attempt >= MAX_CREATE_ATTEMPTS) throw err;
    }
  }
}

/** The reporter's view of a case, or null. `caseCode` must already be normalized. */
export async function findPublicCase(caseCode: string): Promise<PublicCase | null> {
  const row = await prisma.report.findUnique({ where: { caseCode }, select: publicCaseSelect });
  return row ? toPublicCase(row) : null;
}

/** The full moderator view of a case, or null. */
export async function findModeratorReport(id: string): Promise<ModeratorReportDetail | null> {
  const row = await prisma.report.findUnique({ where: { id }, include: moderatorReportDetail });
  return row ? toModeratorDetail(row) : null;
}

// ── Status ───────────────────────────────────────────────────────────────

export interface StatusChange {
  newStatus: ReportStatus;
  note?: string;
  /** Applies to the note: PUBLIC notes are shown to the reporter. Defaults to PUBLIC. */
  visibility?: NoteVisibility;
}

export type StatusChangeResult =
  | { kind: "ok"; report: ModeratorReportDetail }
  | { kind: "not_found" }
  | { kind: "locked" }
  | { kind: "invalid_transition"; from: ReportStatus }
  | { kind: "conflict" };

/**
 * Moves a report to a new status. Closing permanently deletes its evidence
 * files, sets closedAt and clears awaitingReply; the conversation is kept.
 */
export async function changeStatus(
  id: string,
  moderatorId: string,
  { newStatus, note, visibility }: StatusChange,
): Promise<StatusChangeResult> {
  const current = await prisma.report.findUnique({
    where: { id },
    select: { status: true, attachments: { select: { storagePath: true } } },
  });
  if (!current) return { kind: "not_found" };
  if (current.status === "CLOSED") return { kind: "locked" };
  if (!isValidTransition(current.status, newStatus)) return { kind: "invalid_transition", from: current.status };

  const closing = newStatus === "CLOSED";
  if (closing) {
    // Evidence is deleted from storage BEFORE the report is marked closed.
    // If this fails nothing has changed and the close can be retried; the
    // reverse order could leave a closed report whose files still exist.
    // Listing the folder also catches files without a row (e.g. left over
    // from a failed cleanup). Only CLOSED can follow RESOLVED/DISMISSED,
    // so there is no path where the files are needed again.
    const paths = new Set(current.attachments.map((a) => a.storagePath));
    for (const path of await listObjects(`reports/${id}`)) paths.add(path);
    await removeObjects([...paths]);
  }

  return prisma.$transaction(async (tx): Promise<StatusChangeResult> => {
    // Only matches if the status is still the one we validated against, so a
    // concurrent change by another moderator can't be overwritten.
    const { count } = await tx.report.updateMany({
      where: { id, status: current.status },
      data: { status: newStatus, ...(closing && { closedAt: new Date(), awaitingReply: false }) },
    });
    if (count === 0) {
      const now = await tx.report.findUnique({ where: { id }, select: { status: true } });
      return { kind: now?.status === "CLOSED" ? "locked" : "conflict" };
    }

    await tx.statusUpdate.create({ data: { reportId: id, newStatus, note, visibility, moderatorId } });
    if (closing) await tx.attachment.deleteMany({ where: { reportId: id } });

    const report = await tx.report.findUniqueOrThrow({ where: { id }, include: moderatorReportDetail });
    return { kind: "ok", report: toModeratorDetail(report) };
  }, TRANSACTION_OPTIONS);
}

// ── Conversation and notes ───────────────────────────────────────────────

/**
 * Locks the report row and applies `data`, unless the report is CLOSED.
 * Closing takes the same row lock, so a message can't slip in after a close
 * commits: whichever transaction waits re-checks the status once it gets the lock.
 */
async function touchOpenReport(tx: Prisma.TransactionClient, id: string, data: Prisma.ReportUpdateManyMutationInput) {
  const { count } = await tx.report.updateMany({ where: { id, status: { not: "CLOSED" } }, data });
  if (count === 1) return "open" as const;
  const exists = await tx.report.findUnique({ where: { id }, select: { id: true } });
  return exists ? ("closed" as const) : ("not_found" as const);
}

export type ReporterMessageResult =
  | { kind: "ok"; conversation: PublicCase["conversation"] }
  | { kind: "not_found" }
  | { kind: "closed" };

/** Adds a REPORTER message and marks the case as awaiting a reply. `caseCode` must already be normalized. */
export async function postReporterMessage(caseCode: string, body: string): Promise<ReporterMessageResult> {
  return prisma.$transaction(async (tx): Promise<ReporterMessageResult> => {
    const report = await tx.report.findUnique({ where: { caseCode }, select: { id: true } });
    if (!report) return { kind: "not_found" };

    const state = await touchOpenReport(tx, report.id, { awaitingReply: true });
    if (state !== "open") return { kind: state };

    await tx.caseMessage.create({ data: { reportId: report.id, authorType: "REPORTER", body } });
    const updated = await tx.report.findUniqueOrThrow({ where: { id: report.id }, select: publicCaseSelect });
    return { kind: "ok", conversation: toPublicCase(updated).conversation };
  }, TRANSACTION_OPTIONS);
}

export type ModeratorWriteResult = { kind: "ok"; report: ModeratorReportDetail } | { kind: "not_found" } | { kind: "closed" };

/** Adds a MODERATOR message (shown to the reporter as REVIEW_TEAM) and clears awaitingReply. */
export async function postModeratorMessage(id: string, moderatorId: string, body: string): Promise<ModeratorWriteResult> {
  return prisma.$transaction(async (tx): Promise<ModeratorWriteResult> => {
    const state = await touchOpenReport(tx, id, { awaitingReply: false });
    if (state !== "open") return { kind: state };

    await tx.caseMessage.create({ data: { reportId: id, authorType: "MODERATOR", moderatorId, body } });
    const report = await tx.report.findUniqueOrThrow({ where: { id }, include: moderatorReportDetail });
    return { kind: "ok", report: toModeratorDetail(report) };
  }, TRANSACTION_OPTIONS);
}

/** Adds a staff-only note. It never reaches the reporter and doesn't change awaitingReply. */
export async function addInternalNote(id: string, moderatorId: string, body: string): Promise<ModeratorWriteResult> {
  return prisma.$transaction(async (tx): Promise<ModeratorWriteResult> => {
    const state = await touchOpenReport(tx, id, { updatedAt: new Date() });
    if (state !== "open") return { kind: state };

    await tx.internalNote.create({ data: { reportId: id, moderatorId, body } });
    const report = await tx.report.findUniqueOrThrow({ where: { id }, include: moderatorReportDetail });
    return { kind: "ok", report: toModeratorDetail(report) };
  }, TRANSACTION_OPTIONS);
}
