"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/hooks/useReveal";
import { cx } from "@/components/ui/Action";

export interface RevealHeadlineProps {
  /** One entry per visual line; each slides up out of its own mask. */
  lines: readonly ReactNode[];
  as?: "h1" | "h2" | "h3" | "p";
  /** Typography class, e.g. "t-h1". */
  className?: string;
  /** For aria-labelledby. */
  id?: string;
  /** -1 lets a script move focus to the heading (e.g. after a form is replaced). */
  tabIndex?: number;
}

/** Headline that reveals line by line (700ms each, 80ms apart) when scrolled into view. */
export function RevealHeadline({ lines, as: Tag = "h2", className, id, tabIndex }: RevealHeadlineProps) {
  const { ref, revealProps } = useReveal<HTMLHeadingElement>();
  return (
    <Tag ref={ref} id={id} tabIndex={tabIndex} className={className} {...revealProps}>
      {lines.map((line, i) => (
        <span key={i} className="reveal-mask">
          <span className="reveal-line" style={{ "--i": i } as React.CSSProperties}>
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}

export interface FadeUpProps {
  children: ReactNode;
  /** Extra delay in ms, e.g. to follow a headline. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "p" | "li";
}

/** Generic fade-up on scroll into view. */
export function FadeUp({ children, delay = 0, className, as: Tag = "div" }: FadeUpProps) {
  const { ref, revealProps } = useReveal<HTMLDivElement>();
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cx("fade-up", className)}
      style={{ "--delay": `${delay}ms` } as React.CSSProperties}
      {...revealProps}
    >
      {children}
    </Tag>
  );
}
