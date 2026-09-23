"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** "hero": 10% of scroll distance (hero media). "soft": 5% (ribbons). Or a custom fraction. */
export type ParallaxStrength = "hero" | "soft" | number;

const STRENGTH = { hero: 0.1, soft: 0.05 } as const;

/**
 * Subtle scroll parallax. The element moves by `strength` × its distance from
 * the viewport centre. Writes the transform directly (no re-renders) and is
 * off under prefers-reduced-motion. Put it on an inner media layer that has
 * some overflow room, not on the element that defines layout; the parent's
 * visibility decides when it updates.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(strength: ParallaxStrength = "hero") {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const factor = typeof strength === "number" ? strength : STRENGTH[strength];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.style.transform = "";
      return;
    }

    let frame = 0;
    let visible = false;
    let shift = 0; // px currently applied; subtracted so we measure the untransformed position

    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const offset = rect.top - shift + rect.height / 2 - window.innerHeight / 2;
      // If the layer is taller than its container, never move past the extra room.
      const room = el.parentElement ? (el.offsetHeight - el.parentElement.clientHeight) / 2 : 0;
      const raw = -offset * factor;
      const clamped = room > 0 ? Math.max(-room, Math.min(room, raw)) : raw;
      shift = Math.round(clamped * 10) / 10;
      el.style.transform = `translate3d(0, ${shift}px, 0)`;
    };
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) onScroll();
    });

    el.dataset.parallax = "";
    // Watch the untransformed container: the shifted element itself could be
    // moved out of view and never report back in.
    observer.observe(el.parentElement ?? el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [factor, reduced]);

  return ref;
}
