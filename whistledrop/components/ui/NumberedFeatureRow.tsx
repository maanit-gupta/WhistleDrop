"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import { useReveal } from "@/hooks/useReveal";
import styles from "./NumberedFeatureRow.module.css";

export interface NumberedFeatureRowProps {
  /** Shown huge and thin, e.g. "01". */
  number: string;
  /** Two short lines; use <br /> or keep it short. */
  title: ReactNode;
  description?: ReactNode;
  /** Optional interactive content in the right column (a form, a link, …). */
  children?: ReactNode;
  as?: "h2" | "h3" | "h4";
  className?: string;
}

/**
 * [huge "01"] | [title] ........ [46ch paragraph / slot]
 * Hairlines top and bottom; consecutive rows share one. Stacks on mobile.
 * On scroll into view the hairlines draw left to right (the divider top to
 * bottom), then the content fades up, like HairlineDraw.
 */
export function NumberedFeatureRow({ number, title, description, children, as: Heading = "h3", className }: NumberedFeatureRowProps) {
  const { ref, revealProps } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={cx(styles.row, className)} {...revealProps}>
      <span className={styles.number} aria-hidden="true">
        {number}
      </span>
      <span className={styles.rule} aria-hidden="true" />
      <Heading className={styles.title}>
        <span className="visually-hidden">{number}. </span>
        {title}
      </Heading>
      <div className={styles.right}>
        {description && <p className={styles.description}>{description}</p>}
        {children}
      </div>
    </div>
  );
}
