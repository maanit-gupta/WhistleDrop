import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./StatusTimeline.module.css";

export interface TimelineEntry {
  key: string;
  /** Eyebrow-style label, e.g. "Under review". */
  status: ReactNode;
  note?: ReactNode;
  /** ISO string or Date; rendered in the viewer's locale. */
  date: string | Date;
  /** Moderator view only. */
  visibility?: "PUBLIC" | "INTERNAL";
  /** Moderator view only, e.g. the acting moderator's email. */
  author?: ReactNode;
}

export interface StatusTimelineProps {
  entries: TimelineEntry[];
  /** Index of the current entry; defaults to the last one. */
  currentIndex?: number;
  className?: string;
}

const formatDate = (d: string | Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

/** Vertical hairline with nodes, oldest first. The current node is lime; the rest are white at 40%. */
export function StatusTimeline({ entries, currentIndex = entries.length - 1, className }: StatusTimelineProps) {
  return (
    <ol className={cx(styles.timeline, className)} role="list">
      {entries.map((entry, i) => {
        const current = i === currentIndex;
        const date = new Date(entry.date);
        return (
          <li key={entry.key} className={cx(styles.entry, current && styles.current)} aria-current={current ? "step" : undefined}>
            <span className={styles.node} aria-hidden="true" />
            <div className={styles.head}>
              <span className={styles.status}>{entry.status}</span>
              {entry.visibility && (
                <span className={cx(styles.badge, entry.visibility === "INTERNAL" && styles.internal)}>
                  {entry.visibility === "INTERNAL" ? "Internal" : "Public"}
                </span>
              )}
              {current && <span className="visually-hidden">(current)</span>}
            </div>
            {entry.note && <p className={styles.note}>{entry.note}</p>}
            <p className={styles.meta}>
              <time dateTime={date.toISOString()} suppressHydrationWarning>
                {formatDate(date)}
              </time>
              {entry.author && <span> · {entry.author}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
