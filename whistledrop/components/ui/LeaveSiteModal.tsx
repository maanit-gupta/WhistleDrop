"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/components/ui/Action";
import pill from "./PillCTA.module.css";
import styles from "./LeaveSiteModal.module.css";

/** Only http(s) links may be opened; anything else (javascript:, data:, …) is refused. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export interface LeaveSiteModalProps {
  /** Destination; the modal is open while this is set. */
  url: string | null;
  onClose: () => void;
}

/**
 * Interstitial for every external link (including reporter-supplied evidence
 * URLs). Shows the full destination; Continue opens it in a new tab with
 * rel="noopener noreferrer", so it gets no referrer and no handle back here.
 */
export function LeaveSiteModal({ url, onClose }: LeaveSiteModalProps) {
  const safe = safeExternalUrl(url);
  const open = url !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="You're leaving WhistleDrop"
      description={
        safe
          ? "This link goes to a site WhistleDrop doesn't control. It opens in a new tab and won't be told where you came from."
          : "This link can't be opened safely, so WhistleDrop won't open it."
      }
      footer={
        <>
          {safe && (
            <a
              href={safe}
              target="_blank"
              rel="noopener noreferrer"
              className={pill.pill}
              onClick={onClose}
              data-autofocus
            >
              <span className={pill.label}>Continue</span>
            </a>
          )}
          <button type="button" className={cx(styles.cancel, "link-u")} onClick={onClose} data-autofocus={!safe || undefined}>
            Cancel
          </button>
        </>
      }
    >
      {url && (
        <div className={styles.destination}>
          <span className={styles.label}>Destination</span>
          <code className={styles.url}>{url}</code>
        </div>
      )}
    </Modal>
  );
}

export interface LeaveSiteLinkProps {
  /** External destination (http/https only; anything else is refused by the modal). */
  href: string;
  children: ReactNode;
  className?: string;
}

/**
 * An external link that always goes through LeaveSiteModal first. It's a
 * button, not an <a>, so middle-click or "open in new tab" can't skip the
 * warning; the modal's Continue link carries rel="noopener noreferrer".
 */
export function LeaveSiteLink({ href, children, className }: LeaveSiteLinkProps) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={cx("link-u", className)} onClick={() => setUrl(href)}>
        {children}
        <span className="visually-hidden"> (external site, shows a warning first)</span>
      </button>
      <LeaveSiteModal url={url} onClose={() => setUrl(null)} />
    </>
  );
}
