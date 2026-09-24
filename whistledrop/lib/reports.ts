import type { MessageAuthorType, NoteVisibility, Prisma, ReportStatus } from "@prisma/client";

const moderatorRef = { select: { id: true, email: true } } as const;

/**
 * What moderator endpoints load for one report: every status update (PUBLIC
 * and INTERNAL) with the acting moderator, attachment metadata, the
 * conversation and the internal notes. Storage paths stay internal; files are
 * fetched through the signed-URL endpoint. Shape the result with
 * toModeratorDetail before returning it.
 */
export const moderatorReportDetail = {
  statusUpdates: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      note: true,
      visibility: true,
      newStatus: true,
      createdAt: true,
      moderatorId: true,
      moderator: moderatorRef,
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, mimeType: true, sizeBytes: true, createdAt: true },
  },
  messages: {
    orderBy: { createdAt: "asc" },
    select: { id: true, authorType: true, body: true, createdAt: true, moderator: moderatorRef },
  },
  internalNotes: {
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, moderator: moderatorRef },
  },
} satisfies Prisma.ReportInclude;

type ModeratorReportRow = Prisma.ReportGetPayload<{ include: typeof moderatorReportDetail }>;

/**
 * What the public lookup loads. Every status update is read (status changes
 * are always shown to the reporter), but only PUBLIC notes leave the server;
 * see toPublicCase. Nothing about moderators is selected at all.
 */
export const publicCaseSelect = {
  category: true,
  description: true,
  evidenceUrl: true,
  status: true,
  createdAt: true,
  statusUpdates: {
    orderBy: { createdAt: "asc" },
    select: { note: true, newStatus: true, visibility: true, createdAt: true },
  },
  messages: {
    orderBy: { createdAt: "asc" },
    select: { authorType: true, body: true, createdAt: true },
  },
} satisfies Prisma.ReportSelect;

type PublicCaseRow = Prisma.ReportGetPayload<{ select: typeof publicCaseSelect }>;

/** Moderators are shown to the reporter only as the team, never as a person. */
const publicAuthor = (type: MessageAuthorType) => (type === "MODERATOR" ? "REVIEW_TEAM" : "REPORTER");

/** A PUBLIC note belongs to the reporter's view; an INTERNAL one never does. */
const publicNote = (u: { note: string | null; visibility: NoteVisibility }) =>
  u.visibility === "PUBLIC" && u.note ? u.note : undefined;

/** Merges already-sorted lists into one chronological list (stable: ties keep list order). */
function chronological<T extends { createdAt: Date }>(...lists: T[][]): T[] {
  return lists.flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export type PublicConversationEntry =
  | { type: "message"; author: "REPORTER" | "REVIEW_TEAM"; body: string; createdAt: Date }
  | { type: "status"; status: ReportStatus; note?: string; createdAt: Date };

/**
 * The reporter's view of a case. `statusUpdates` keeps its original shape
 * (PUBLIC updates only). `conversation` merges the messages with every status
 * change as a system event carrying only its PUBLIC note. No ids, moderator
 * details or visibility flags are returned.
 */
export function toPublicCase({ statusUpdates, messages, ...report }: PublicCaseRow) {
  const conversation: PublicConversationEntry[] = chronological<PublicConversationEntry>(
    messages.map((m) => ({ type: "message", author: publicAuthor(m.authorType), body: m.body, createdAt: m.createdAt })),
    statusUpdates.map((u) => {
      const note = publicNote(u);
      return { type: "status", status: u.newStatus, ...(note !== undefined && { note }), createdAt: u.createdAt };
    }),
  );
  return {
    ...report,
    statusUpdates: statusUpdates
      .filter((u) => u.visibility === "PUBLIC")
      .map(({ note, newStatus, createdAt }) => ({ note, newStatus, createdAt })),
    conversation,
  };
}

export type ModeratorConversationEntry =
  | {
      type: "message";
      id: string;
      author: "REPORTER" | "REVIEW_TEAM";
      body: string;
      createdAt: Date;
      moderator: { id: string; email: string } | null;
    }
  | {
      type: "status";
      id: string;
      status: ReportStatus;
      note?: string;
      visibility: NoteVisibility;
      createdAt: Date;
      moderator: { id: string; email: string } | null;
    };

export type InternalNoteEntry = {
  type: "note" | "status";
  id: string;
  /** Set for type "status": the status the INTERNAL update moved the case to. */
  status?: ReportStatus;
  note: string | null;
  createdAt: Date;
  moderator: { id: string; email: string } | null;
};

/**
 * The moderator view: the same conversation the reporter sees (identical
 * entries and notes) plus who wrote what, for staff accountability; and,
 * separately, everything staff-only: INTERNAL status updates and internal notes.
 */
export function toModeratorDetail({ messages, internalNotes, ...report }: ModeratorReportRow) {
  const conversation = chronological<ModeratorConversationEntry>(
    messages.map((m) => ({
      type: "message",
      id: m.id,
      author: publicAuthor(m.authorType),
      body: m.body,
      createdAt: m.createdAt,
      moderator: m.moderator,
    })),
    report.statusUpdates.map((u) => {
      const note = publicNote(u);
      return {
        type: "status",
        id: u.id,
        status: u.newStatus,
        ...(note !== undefined && { note }),
        visibility: u.visibility,
        createdAt: u.createdAt,
        moderator: u.moderator,
      };
    }),
  );
  const notes = chronological<InternalNoteEntry>(
    report.statusUpdates
      .filter((u) => u.visibility === "INTERNAL")
      .map((u) => ({ type: "status", id: u.id, status: u.newStatus, note: u.note, createdAt: u.createdAt, moderator: u.moderator })),
    internalNotes.map((n) => ({ type: "note", id: n.id, note: n.body, createdAt: n.createdAt, moderator: n.moderator })),
  );
  return { ...report, conversation, internalNotes: notes };
}

export type ModeratorReportDetail = ReturnType<typeof toModeratorDetail>;
export type PublicCase = ReturnType<typeof toPublicCase>;
