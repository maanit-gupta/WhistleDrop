import type { ReportStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/client/labels";
import timeline from "./StatusTimeline.module.css";

/**
 * A report's status as a small outlined tag, for tables and lists. It is the
 * StatusTimeline badge (same style, no lime), so a column of statuses doesn't
 * add lime to the screen.
 */
export function StatusTag({ status }: { status: ReportStatus }) {
  return <span className={timeline.badge}>{STATUS_LABELS[status]}</span>;
}
