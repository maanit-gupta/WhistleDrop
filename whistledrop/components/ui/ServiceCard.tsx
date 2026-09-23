import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./ServiceCard.module.css";

export interface ServiceCardProps {
  title: ReactNode;
  /** Muted, clamped to two lines. */
  description?: ReactNode;
  /** Optional big numeral (e.g. a count or "01"), top right. */
  numeral?: ReactNode;
  /** Lime hairline and numeral: use on at most one card per row. */
  accent?: boolean;
  /** Heading level for the title. */
  as?: "h2" | "h3" | "h4";
  className?: string;
}

export function ServiceCard({ title, description, numeral, accent = false, as: Heading = "h3", className }: ServiceCardProps) {
  return (
    <article className={cx(styles.card, accent && styles.accent, className)}>
      <div className={styles.top}>
        <Heading className={styles.title}>{title}</Heading>
        {numeral !== undefined && <span className={styles.numeral}>{numeral}</span>}
      </div>
      <hr className={styles.hairline} />
      {description && <p className={styles.description}>{description}</p>}
    </article>
  );
}
