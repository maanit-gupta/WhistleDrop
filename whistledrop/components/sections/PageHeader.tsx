import type { ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import { HairlineDraw } from "@/components/ui/HairlineDraw";
import { RevealHeadline } from "@/components/ui/Reveal";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  /** H1, one entry per line. */
  lines: readonly ReactNode[];
  subline?: ReactNode;
  /** "short": the hairline stops at ~40% of the width. */
  rule?: "full" | "short";
  className?: string;
}

/** White page opener shared by the reporter pages: H1, a drawn hairline, a quiet subline. */
export function PageHeader({ lines, subline, rule = "full", className }: PageHeaderProps) {
  return (
    <section className={cx("surface-light", styles.header, className)}>
      <div className="container">
        <RevealHeadline as="h1" className={cx("t-h1", styles.title)} lines={lines} />
        <HairlineDraw className={cx(styles.rule, rule === "short" && styles.short)}>
          {subline && <p className={styles.subline}>{subline}</p>}
        </HairlineDraw>
      </div>
    </section>
  );
}
