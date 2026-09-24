"use client";

import { useRef, useState } from "react";
import { cx } from "@/components/ui/Action";
import { LeaveSiteLink } from "@/components/ui/LeaveSiteModal";
import tag from "@/components/ui/EyebrowTag.module.css";
import { DEMO_SIGN_INS_URL } from "@/lib/site";
import type { DemoChapter } from "@/lib/demo";
import styles from "./Demo.module.css";

export const DEMO_VIDEO_SRC = "/media/demo.mp4";
export const DEMO_POSTER_SRC = "/media/demo-poster.jpg";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * Native <video> with chapter buttons. Nothing plays until the viewer asks:
 * no autoplay, and only the metadata is fetched up front. A chapter button
 * jumps to its timestamp and plays (a click is the viewer's own request).
 */
export function DemoPlayer({ chapters, duration }: { chapters: readonly DemoChapter[]; duration: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState<number | null>(null);

  const jump = (start: number) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = start;
    void el.play().catch(() => {});
  };

  const onTime = () => {
    const t = video.current?.currentTime ?? 0;
    let index: number | null = null;
    chapters.forEach((c, i) => {
      if (t >= c.start) index = i;
    });
    setCurrent(index);
  };

  return (
    <div className={styles.player}>
      <div className={styles.frame}>
        <video
          ref={video}
          className={styles.video}
          src={DEMO_VIDEO_SRC}
          poster={DEMO_POSTER_SRC}
          controls
          preload="metadata"
          playsInline
          width={1440}
          height={900}
          aria-describedby="demo-summary"
          onTimeUpdate={onTime}
        >
          Your browser can&apos;t play this video. The walkthrough is summarised below.
        </video>
      </div>

      {chapters.length > 0 && (
        <ul className={styles.chapters} role="list" aria-label="Chapters">
          {chapters.map((c, i) => (
            <li key={c.label}>
              <button
                type="button"
                className={cx(tag.tag, styles.chapter)}
                onClick={() => jump(c.start)}
                aria-current={current === i ? "true" : undefined}
                data-start={c.start}
              >
                {c.label}
                <span className={styles.chapterTime} aria-hidden="true">
                  {clock(c.start)}
                </span>
                <span className="visually-hidden">, jump to {clock(c.start)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.tryIt}>
        Try it yourself — demo moderator accounts are in{" "}
        <LeaveSiteLink href={DEMO_SIGN_INS_URL}>DUMMY_SIGN_INS.txt</LeaveSiteLink>
      </div>

      <details className={styles.summary} id="demo-summary">
        <summary className="t-nav">What the video shows{duration > 0 ? ` (${clock(duration)}, no sound)` : ""}</summary>
        <ol>
          {chapters.map((c) => (
            <li key={c.label}>
              <strong>{c.label}</strong> ({clock(c.start)}): {c.summary}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
