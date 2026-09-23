"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useParallax, type ParallaxStrength } from "@/hooks/useParallax";
import { MEDIA, type MediaSlot } from "@/components/visuals/media";
import styles from "./MediaFrame.module.css";

export interface MediaFrameProps {
  /** Which /public/media slot can replace the generated art (see media.ts). */
  slot?: MediaSlot;
  /** Explicit image path; overrides the slot. */
  src?: string | null;
  /** "lime-wash": --lime-200 behind, art in grayscale multiplied on top. */
  tint?: "none" | "lime-wash";
  /** Scroll parallax on the art layer; off by default. */
  parallax?: ParallaxStrength | false;
  className?: string;
  /** Generated fallback art (inline SVG). */
  children: ReactNode;
}

/**
 * The one wrapper every visual renders through. It owns size, crop, tint and
 * parallax, so swapping generated SVG art for a real asset changes nothing
 * around it. Decorative: hidden from assistive tech.
 */
export function MediaFrame({ slot, src, tint = "none", parallax = false, className, children }: MediaFrameProps) {
  const image = src ?? (slot ? MEDIA[slot] : null);
  const parallaxRef = useParallax<HTMLDivElement>(parallax === false ? 0 : parallax);

  return (
    <div className={[styles.frame, className].filter(Boolean).join(" ")} data-tint={tint} aria-hidden="true">
      <div ref={parallax === false ? undefined : parallaxRef} className={styles.art} data-has-parallax={parallax !== false}>
        {image ? <Image src={image} alt="" fill sizes="(max-width: 767px) 100vw, 50vw" className={styles.image} /> : children}
      </div>
    </div>
  );
}
