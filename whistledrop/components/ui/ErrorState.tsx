import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./States.module.css";

export interface ErrorStateProps {
  title?: ReactNode;
  /** Plain, specific, and never containing a case code. */
  message: ReactNode;
  /** e.g. <PillCTA onClick={retry}>Try again</PillCTA> */
  action?: ReactNode;
  className?: string;
}

/** Announced immediately (role="alert"). */
export function ErrorState({ title = "Something went wrong", message, action, className }: ErrorStateProps) {
  return (
    <div className={cx(styles.state, styles.error, className)} role="alert">
      <span className={styles.rule} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{message}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
