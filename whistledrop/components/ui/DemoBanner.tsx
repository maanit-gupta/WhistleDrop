"use client";

import { useEffect, useRef } from "react";
import styles from "./DemoBanner.module.css";

export const DEMO_BANNER_TEXT =
  "Public demo. Reports here are visible to anyone using the demo moderator accounts. Do not submit real information.";

/**
 * Slim notice pinned to the top of reporter pages on a DEMO_MODE instance.
 * Warm paper and dark ink, never lime, so it can't be mistaken for an action.
 * It publishes its height as --demo-banner-height so the floating NavPill sits
 * below it (the CSS has a fallback for before hydration).
 */
export function DemoBanner() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--demo-banner-height", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--demo-banner-height");
    };
  }, []);

  return (
    <div ref={ref} className={styles.banner} role="note" aria-label="Demo notice" data-demo-banner>
      <p className={styles.text}>{DEMO_BANNER_TEXT}</p>
    </div>
  );
}
