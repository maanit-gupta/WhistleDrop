import { cx } from "@/components/ui/Action";
import styles from "./HairlineShimmer.module.css";

export interface HairlineShimmerProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Announced to screen readers. */
  label?: string;
  className?: string;
}

/** Loading state: hairline rows with a light passing along them. No spinners. */
export function HairlineShimmer({ rows = 3, label = "Loading", className }: HairlineShimmerProps) {
  return (
    <div className={cx(styles.shimmer, className)} role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={styles.row} style={{ "--i": i } as React.CSSProperties} aria-hidden="true" />
      ))}
    </div>
  );
}
