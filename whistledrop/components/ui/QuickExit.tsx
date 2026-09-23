"use client";

import { QUICK_EXIT_URL } from "@/lib/site";
import styles from "./QuickExit.module.css";

/**
 * Always-available "Leave site" button. location.replace() swaps this page
 * out of the tab's history, so pressing Back doesn't return to WhistleDrop.
 */
export function QuickExit() {
  return (
    <button type="button" className={styles.exit} onClick={() => window.location.replace(QUICK_EXIT_URL)}>
      Leave site<span className="visually-hidden"> now (goes to Google and removes this page from Back)</span>
    </button>
  );
}
