"use client";

import { useEffect, useState } from "react";

export type ScrollDirection = "up" | "down" | null;

export interface ScrollState {
  direction: ScrollDirection;
  /** True once the page has scrolled past `threshold` pixels. */
  pastThreshold: boolean;
}

/**
 * Scroll direction, updated at most once per frame and only when something
 * changes (not on every pixel). Drives the NavPill fade.
 *
 * @param threshold px from the top after which `pastThreshold` is true
 *   (e.g. the hero's height). Defaults to 80% of the viewport height.
 * @param tolerance px of movement ignored, so tiny jitters don't flip direction.
 */
export function useScrollDirection(threshold?: number, tolerance = 6): ScrollState {
  const [state, setState] = useState<ScrollState>({ direction: null, pastThreshold: false });

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const limit = threshold ?? window.innerHeight * 0.8;
      const delta = y - lastY;
      setState((prev) => {
        const direction: ScrollDirection =
          Math.abs(delta) < tolerance ? prev.direction : delta > 0 ? "down" : "up";
        const pastThreshold = y > limit;
        return direction === prev.direction && pastThreshold === prev.pastThreshold
          ? prev
          : { direction, pastThreshold };
      });
      if (Math.abs(delta) >= tolerance) lastY = y;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold, tolerance]);

  return state;
}
