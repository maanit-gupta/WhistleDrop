"use client";

import { cx } from "@/components/ui/Action";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  /** 1-based, as the API uses. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Disable the controls while a page is loading. */
  busy?: boolean;
  className?: string;
}

/** "Showing X–Y of Z" plus previous / next. Matches GET /api/mod/reports paging. */
export function Pagination({ page, pageSize, total, onPageChange, busy = false, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <nav className={cx(styles.pagination, className)} aria-label="Pagination">
      <p className={styles.summary} aria-live="polite">
        {total === 0 ? "No results" : (
          <>
            Showing <span className="tabular">{fmt(from)}–{fmt(to)}</span> of <span className="tabular">{fmt(total)}</span>
          </>
        )}
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          className={cx(styles.button, "link-u")}
          onClick={() => onPageChange(page - 1)}
          disabled={busy || page <= 1}
        >
          <span aria-hidden="true">← </span>Previous<span className="visually-hidden"> page</span>
        </button>
        <span className={styles.page} aria-hidden="true">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className={cx(styles.button, "link-u")}
          onClick={() => onPageChange(page + 1)}
          disabled={busy || page >= totalPages}
        >
          Next<span className="visually-hidden"> page</span>
          <span aria-hidden="true"> →</span>
        </button>
      </div>
    </nav>
  );
}
