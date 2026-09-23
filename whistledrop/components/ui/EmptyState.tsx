import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./States.module.css";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** e.g. a PillCTA or a "Clear filters" button. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, className)}>
      <span className={styles.rule} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
