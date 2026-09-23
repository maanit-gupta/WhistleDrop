import { Children, type ReactNode } from "react";
import { cx } from "@/components/ui/Action";

export interface StickyStackProps {
  children: ReactNode;
  /** Where the first card sticks, in px from the top (clears the NavPill). */
  top?: number;
  className?: string;
}

/**
 * Cards that slide up and overlap the previous one, leaving a 16px peek.
 * CSS only (position: sticky). Normal document flow below 768px.
 * Give each card an opaque background so the overlap reads.
 */
export function StickyStack({ children, top = 120, className }: StickyStackProps) {
  return (
    <div className={cx("sticky-stack", className)} style={{ "--stack-top": `${top}px` } as React.CSSProperties}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} className="sticky-stack__item" style={{ "--i": i } as React.CSSProperties}>
          {child}
        </div>
      ))}
    </div>
  );
}
