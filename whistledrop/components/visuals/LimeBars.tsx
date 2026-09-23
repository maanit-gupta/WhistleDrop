import styles from "./LimeBars.module.css";

/** A default rising profile, 0–1. */
export const DEFAULT_BAR_HEIGHTS = [0.22, 0.34, 0.28, 0.46, 0.4, 0.58, 0.52, 0.7, 0.64, 0.86];

export interface LimeBarsProps {
  /** Bar heights as fractions of the container (0–1). */
  heights?: readonly number[];
  /** Change it to replay the grow animation (e.g. the active slide index). */
  playKey?: string | number;
  className?: string;
}

/**
 * Thin lime vertical bars (70% opacity) rising like a bar chart, overlaid on
 * a visual. They grow upward, staggered, over 600ms. Thin by design: this
 * never becomes a flat lime block.
 */
export function LimeBars({ heights = DEFAULT_BAR_HEIGHTS, playKey, className }: LimeBarsProps) {
  return (
    <div key={playKey} className={[styles.bars, className].filter(Boolean).join(" ")} aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className={styles.bar}
          style={{ "--h": Math.max(0, Math.min(1, h)), "--i": i } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
