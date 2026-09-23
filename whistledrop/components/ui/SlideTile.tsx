"use client";

import { useId, useState, type ReactNode } from "react";
import { AbstractTile, type AbstractVariant } from "@/components/visuals/AbstractTile";
import { LimeBars } from "@/components/visuals/LimeBars";
import { cx } from "@/components/ui/Action";
import styles from "./SlideTile.module.css";

export interface Slide {
  /** 17px light statement on the dark card. */
  statement: ReactNode;
  /** Lime uppercase label near the bottom. */
  label: ReactNode;
  subLabel?: ReactNode;
  /** Left tile art; defaults to AbstractTile cycling through its variants. */
  visual?: ReactNode;
  /** Lime bar heights (0–1) over the visual. */
  bars?: readonly number[];
}

export interface SlideTilePairProps {
  slides: readonly Slide[];
  /** Accessible name for the carousel, e.g. "How WhistleDrop protects you". */
  label: string;
  className?: string;
}

/**
 * Two tiles: a grayscale visual with rising lime bars, and a statement card.
 * Changing slides sweeps lime scanlines down the visual, regrows the bars and
 * crossfades the statement. Arrow buttons are labelled and keyboard operable;
 * Left/Right arrow keys also work while focus is inside the carousel.
 */
export function SlideTilePair({ slides, label, className }: SlideTilePairProps) {
  const [index, setIndex] = useState(0);
  const [generation, setGeneration] = useState(0);
  const liveId = useId();
  const pairId = useId();
  const count = slides.length;
  const slide = slides[index];

  const go = (delta: number) => {
    setIndex((i) => (i + delta + count) % count);
    setGeneration((g) => g + 1);
  };

  const visual = slide.visual ?? <AbstractTile variant={(index % 3) as AbstractVariant} />;

  return (
    <section
      className={cx(styles.carousel, className)}
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
    >
      <div id={pairId} className={styles.pair}>
        <div className={styles.visualTile} aria-hidden="true">
          <div key={`v-${index}`} className={styles.visualInner}>
            {visual}
          </div>
          <LimeBars heights={slide.bars} playKey={`b-${generation}`} className={styles.bars} />
          {generation > 0 && <div key={`s-${generation}`} className={styles.scanlines} />}
        </div>

        <div
          className={styles.card}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${count}`}
        >
          <div key={`c-${index}`} className={styles.cardInner}>
            <p className={styles.statement}>{slide.statement}</p>
            <div className={styles.cardFoot}>
              <p className={styles.label}>{slide.label}</p>
              {slide.subLabel && <p className={styles.subLabel}>{slide.subLabel}</p>}
            </div>
          </div>
        </div>
      </div>

      {count > 1 && (
        <div className={styles.arrows}>
          <button type="button" className={styles.arrow} onClick={() => go(-1)} aria-controls={pairId}>
            <span aria-hidden="true">←</span>
            <span className="visually-hidden">Previous slide</span>
          </button>
          <button type="button" className={styles.arrow} onClick={() => go(1)} aria-controls={pairId}>
            <span aria-hidden="true">→</span>
            <span className="visually-hidden">Next slide</span>
          </button>
        </div>
      )}
      <p id={liveId} className="visually-hidden" aria-live="polite" aria-atomic="true">
        {generation > 0 ? `Slide ${index + 1} of ${count}` : ""}
      </p>
    </section>
  );
}
