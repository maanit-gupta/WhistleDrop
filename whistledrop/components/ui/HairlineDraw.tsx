"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/hooks/useReveal";
import { cx } from "@/components/ui/Action";

/** A hairline that draws left to right (scaleX 0→1, 900ms), then its content fades up. */
export function HairlineDraw({ children, className }: { children?: ReactNode; className?: string }) {
  const { ref, revealProps } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={cx("hairline-draw", className)} {...revealProps}>
      <div className="hairline-draw__line" aria-hidden="true" />
      {children !== undefined && <div className="hairline-draw__content">{children}</div>}
    </div>
  );
}
