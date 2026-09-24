import "server-only";
import bcrypt from "bcryptjs";
import type { ModeratorRole, NoteVisibility, ReportCategory, ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  addInternalNote,
  changeStatus,
  createReport,
  postModeratorMessage,
  postReporterMessage,
} from "@/lib/cases";

// Public demo accounts and sample cases, so reviewers can try the moderator
// and admin features on the live site. The credentials are public by design
// (prisma/seed-demo.ts, DUMMY_SIGN_INS.txt), so the accounts are locked down
// on the server: see app/api/admin/moderators and the daily cron, which calls
// reassertDemoAccounts().

const BCRYPT_COST = 12;

export type DemoAccountKey = "admin" | "aria" | "kiran";

/** The demo accounts and their fixed roles. Passwords live only in prisma/seed-demo.ts. */
export const DEMO_ACCOUNTS: Record<DemoAccountKey, { email: string; role: ModeratorRole }> = {
  admin: { email: "admin@whistledrop.demo", role: "ADMIN" },
  aria: { email: "aria@whistledrop.demo", role: "MODERATOR" },
  kiran: { email: "kiran@whistledrop.demo", role: "MODERATOR" },
};

/**
 * Makes every demo account active with its original role again. Run daily by
 * /api/cron/cleanup. Returns how many demo accounts exist.
 */
export async function reassertDemoAccounts(): Promise<number> {
  let count = 0;
  for (const { email, role } of Object.values(DEMO_ACCOUNTS)) {
    const result = await prisma.moderator.updateMany({ where: { email, isDemo: true }, data: { role, isActive: true } });
    count += result.count;
  }
  return count;
}

/** Creates or restores the demo accounts (idempotent). Returns their ids. */
export async function seedDemoAccounts(passwords: Record<DemoAccountKey, string>) {
  const ids = {} as Record<DemoAccountKey, string>;
  for (const key of Object.keys(DEMO_ACCOUNTS) as DemoAccountKey[]) {
    const { email, role } = DEMO_ACCOUNTS[key];
    const passwordHash = await bcrypt.hash(passwords[key], BCRYPT_COST);
    const moderator = await prisma.moderator.upsert({
      where: { email },
      update: { passwordHash, role, isActive: true, isDemo: true },
      create: { email, passwordHash, role, isDemo: true },
      select: { id: true },
    });
    ids[key] = moderator.id;
  }
  return ids;
}

// ── Sample cases ─────────────────────────────────────────────────────────

type Step =
  | { status: ReportStatus; by: DemoAccountKey; note?: string; visibility?: NoteVisibility }
  | { reply: string; by: DemoAccountKey }
  | { reporter: string }
  | { internal: string; by: DemoAccountKey };

interface DemoCase {
  /** Fixed, so the codes in DUMMY_SIGN_INS.txt work on every deployment. */
  caseCode: string;
  category: ReportCategory;
  description: string;
  steps: Step[];
}

/**
 * Neutral, fictional cases: no real names, organisations or graphic detail.
 * Every step goes through the same service functions as the API.
 */
export const DEMO_CASES: DemoCase[] = [
  {
    caseCode: "WD-DEMO-0001",
    category: "SECURITY",
    description:
      "An internal file server used by several teams is still running an operating system version that stopped receiving security updates last year. It is reachable from the office network and stores shared project documents. I raised it informally before but nothing changed.",
    steps: [
      { status: "UNDER_REVIEW", by: "aria", note: "Thank you for reporting this. We have started looking into it." },
      { internal: "Asked the IT team for the server inventory. No names shared.", by: "aria" },
      {
        reply:
          "Could you tell us roughly which part of the office network the server is on, or what it is used for? Please don't include any names.",
        by: "aria",
      },
      { reporter: "It hosts the shared drive for the planning and facilities teams. It is on the main office network." },
    ],
  },
  {
    caseCode: "WD-DEMO-0002",
    category: "CORRUPTION",
    description:
      "Several purchases for office equipment appear to have been split into smaller orders so that each stays just under the amount that needs a second approval. The orders go to the same supplier within a few days of each other.",
    steps: [
      { status: "UNDER_REVIEW", by: "kiran" },
      { reply: "Thank you. Do you know roughly which months these orders were placed in?", by: "kiran" },
      { reporter: "Mostly in the spring, between March and May." },
      { reply: "Thank you, that helps us narrow it down.", by: "kiran" },
      { internal: "Finance confirmed a pattern of split orders. Referred to internal audit.", by: "kiran" },
      {
        status: "RESOLVED",
        by: "kiran",
        note: "The orders have been referred to internal audit and the approval process has been tightened. Thank you for speaking up.",
      },
    ],
  },
  {
    caseCode: "WD-DEMO-0003",
    category: "HARASSMENT",
    description:
      "A colleague in a senior role regularly makes dismissive remarks about team members in meetings and has excluded some people from team communications. Several people have become reluctant to speak up.",
    steps: [
      { status: "UNDER_REVIEW", by: "aria", note: "We have received your report and a reviewer has been assigned." },
      {
        reply:
          "Thank you for trusting us with this. Is this still happening, and would it help if we reminded the whole department about the conduct policy?",
        by: "aria",
      },
      { reporter: "Yes, it happened again this week. A general reminder would help." },
      { reply: "Thank you. We will follow up with the department and HR.", by: "aria" },
      { internal: "HR informed. Department-wide conduct reminder scheduled.", by: "admin" },
      {
        status: "RESOLVED",
        by: "aria",
        note: "HR has followed up and a conduct reminder has been sent to the department.",
      },
      {
        status: "CLOSED",
        by: "admin",
        note: "This case is now closed. The conversation stays readable with your case code.",
      },
    ],
  },
  {
    caseCode: "WD-DEMO-0004",
    category: "TECHNICAL",
    description:
      "The nightly backup job for the customer support database has been reporting success, but the backup files have been empty for at least two weeks. Nobody seems to have noticed because the job status shows green.",
    steps: [],
  },
  {
    caseCode: "WD-DEMO-0005",
    category: "OTHER",
    description:
      "Boxes from deliveries are often left in the corridor next to a fire exit on one of the floors, partly blocking it for most of the day.",
    steps: [
      { status: "UNDER_REVIEW", by: "kiran" },
      {
        status: "DISMISSED",
        by: "kiran",
        note: "Facilities confirmed the corridor was cleared and deliveries now go to the loading area, so no further action is needed here.",
      },
    ],
  },
];

async function runStep(step: Step, report: { id: string; caseCode: string }, ids: Record<DemoAccountKey, string>) {
  let result: { kind: string };
  if ("status" in step) {
    result = await changeStatus(report.id, ids[step.by], {
      newStatus: step.status,
      note: step.note,
      visibility: step.visibility,
    });
  } else if ("reply" in step) {
    result = await postModeratorMessage(report.id, ids[step.by], step.reply);
  } else if ("reporter" in step) {
    result = await postReporterMessage(report.caseCode, step.reporter);
  } else {
    result = await addInternalNote(report.id, ids[step.by], step.internal);
  }
  if (result.kind !== "ok") throw new Error(`Demo case ${report.caseCode}: step failed (${result.kind})`);
}

/**
 * Creates the sample cases that don't exist yet (idempotent: an existing case
 * code is left as it is). Returns every demo case with whether it was created.
 */
export async function seedDemoCases(ids: Record<DemoAccountKey, string>) {
  const out: { caseCode: string; category: ReportCategory; status: ReportStatus; created: boolean }[] = [];
  for (const demo of DEMO_CASES) {
    const existing = await prisma.report.findUnique({ where: { caseCode: demo.caseCode }, select: { status: true } });
    if (existing) {
      out.push({ caseCode: demo.caseCode, category: demo.category, status: existing.status, created: false });
      continue;
    }
    const report = await createReport(
      { category: demo.category, description: demo.description },
      { caseCode: demo.caseCode },
    );
    try {
      for (const step of demo.steps) {
        // A few ms apart, so every entry gets its own timestamp and the thread order is fixed.
        await new Promise((resolve) => setTimeout(resolve, 20));
        await runStep(step, report, ids);
      }
    } catch (err) {
      // Don't leave a half-built case behind: a re-run would skip it as "existing".
      await prisma.report.delete({ where: { id: report.id } }).catch(() => {});
      throw err;
    }
    const { status } = await prisma.report.findUniqueOrThrow({ where: { id: report.id }, select: { status: true } });
    out.push({ caseCode: demo.caseCode, category: demo.category, status, created: true });
  }
  return out;
}
