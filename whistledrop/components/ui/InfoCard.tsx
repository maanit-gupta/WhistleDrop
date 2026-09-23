import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./InfoCard.module.css";

export interface InfoItem {
  label: ReactNode;
  value: ReactNode;
}

/** Stacked label/value blocks on a dark card (a description list). */
export function InfoCard({ items, className, title }: { items: InfoItem[]; className?: string; title?: ReactNode }) {
  return (
    <section className={cx(styles.card, className)}>
      {title && <h3 className={styles.heading}>{title}</h3>}
      <dl className={styles.list}>
        {items.map((item, i) => (
          <div key={i} className={styles.item}>
            <dt className={styles.label}>{item.label}</dt>
            <dd className={styles.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
