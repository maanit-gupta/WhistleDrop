"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface RevealOptions {
  /** Fraction of the element that must be visible. */
  threshold?: number;
  rootMargin?: string;
}

/**
 * Reveal-on-scroll. Attach `ref` and spread `revealProps` on the element; the
 * CSS in app/styles/globals.css does the rest:
 *
 * - Headline lines: `.reveal-mask > .reveal-line` with `--i` per line. Each
 *   line slides up 24px out of its clipping mask over 700ms, 80ms apart.
 *   (<RevealHeadline> in components/ui/Reveal.tsx wires this up.)
 * - Generic fade-up: put `.fade-up` on the element itself.
 * - HairlineDraw: `.hairline-draw__line` + `.hairline-draw__content`.
 *
 * Hidden states only apply with scripting enabled, and reduced motion
 * shows everything at once.
 */
export function useReveal<T extends Element = HTMLDivElement>({
  threshold = 0.2,
  rootMargin = "0px 0px -10% 0px",
}: RevealOptions = {}) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || revealed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, revealed, threshold, rootMargin]);

  const shown = revealed || reduced;
  return { ref, revealed: shown, revealProps: { "data-reveal": shown ? "done" : "pending" } } as const;
}
