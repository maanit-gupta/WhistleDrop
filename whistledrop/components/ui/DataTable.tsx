"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./DataTable.module.css";

export interface DataColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** CSS width for the column, e.g. "18%" or "140px". */
  width?: string;
  align?: "start" | "end";
  /** Hide this column in the mobile card view. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> {
  /** Accessible name for the table (visually hidden caption). */
  caption: string;
  columns: DataColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /**
   * Makes rows navigable. The first column's content becomes a real link
   * (keyboard and screen readers); clicking anywhere on the row follows it.
   * Never build hrefs from case codes: use internal ids.
   */
  rowHref?: (row: Row) => string;
  /** Accessible name for the row link, when the first cell's text alone isn't descriptive. */
  rowLinkLabel?: (row: Row) => string;
  className?: string;
}

/**
 * Dark data table: hairline rows, small uppercase headers, a left-to-right
 * underline on row hover. Below 768px it renders as a list of cards instead.
 */
export function DataTable<Row>({ caption, columns, rows, rowKey, rowHref, rowLinkLabel, className }: DataTableProps<Row>) {
  const router = useRouter();
  const [first, ...rest] = columns;

  const primary = (row: Row) => {
    const content = first.cell(row);
    if (!rowHref) return content;
    return (
      <Link href={rowHref(row)} className={styles.rowLink} aria-label={rowLinkLabel?.(row)}>
        {content}
      </Link>
    );
  };

  const onRowClick = (row: Row) => (e: React.MouseEvent) => {
    if (!rowHref) return;
    // Let real links, buttons and text selection behave normally.
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
    if (window.getSelection()?.toString()) return;
    router.push(rowHref(row));
  };

  return (
    <div className={cx(styles.wrap, className)}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ width: c.width }} className={cx(c.align === "end" && styles.end)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={cx(styles.row, rowHref && styles.clickable)} onClick={onRowClick(row)}>
              <td>{primary(row)}</td>
              {rest.map((c) => (
                <td key={c.key} className={cx(c.align === "end" && styles.end)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={styles.cards} role="list" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cx(styles.card, rowHref && styles.clickable)} onClick={onRowClick(row)}>
            <div className={styles.cardPrimary}>{primary(row)}</div>
            <dl className={styles.cardFields}>
              {rest
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className={styles.cardField}>
                    <dt>{c.header}</dt>
                    <dd>{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
