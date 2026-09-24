"use client";

import type { NoteVisibility, ReportStatus } from "@prisma/client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BlockCTA } from "@/components/ui/BlockCTA";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { InfoCard } from "@/components/ui/InfoCard";
import { LeaveSiteLink, safeExternalUrl } from "@/components/ui/LeaveSiteModal";
import { Modal } from "@/components/ui/Modal";
import { PillCTA } from "@/components/ui/PillCTA";
import { StatusTimeline, type TimelineEntry } from "@/components/ui/StatusTimeline";
import { UnderlineSelect, UnderlineTextarea } from "@/components/ui/UnderlineField";
import { getAttachmentUrl, getReport, updateReportStatus, type ReportDetail } from "@/lib/client/api";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  formatBytes,
  formatDateTime,
  formatMimeType,
} from "@/lib/client/labels";
import { nextStatuses } from "@/lib/transitions.shared";
import { ROUTES } from "@/lib/site";
import { useModSession } from "../../ModShell";
import mod from "../../mod.module.css";
import styles from "./detail.module.css";

// Moderator view of one report, addressed by its internal id (never the case
// code). The case code is shown on the page but never put in a URL, storage or
// the console.

type Load =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; report: ReportDetail };

const NOTE_MAX = 2000;
const VISIBILITY_OPTIONS = [
  { value: "PUBLIC", label: "Public" },
  { value: "INTERNAL", label: "Internal" },
];

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Opens a URL in a new tab with no opener and no referrer. */
function openInNewTab(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

export function ReportDetailView({ id }: { id: string }) {
  const { reportFailure } = useModSession();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // Set by a 423 from the status endpoint: keeps the panel up, locked, even once the report reads as CLOSED.
  const [locked, setLocked] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);

  const fetchReport = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    void getReport(id, { signal: current.signal }).then((r) => {
      if (current.signal.aborted) return;
      if (r.ok) setLoad({ kind: "ready", report: r.data });
      else if (r.status === 404) setLoad({ kind: "notFound" });
      else {
        reportFailure(r);
        setLoad({ kind: "failed", message: r.message });
      }
    });
  }, [id, reportFailure]);

  useEffect(() => {
    fetchReport();
    return () => controller.current?.abort();
  }, [fetchReport]);

  const back = (
    <Link href={ROUTES.modReports} className={`link-u t-nav ${mod.back}`}>
      <span aria-hidden="true">← </span>All reports
    </Link>
  );

  if (load.kind !== "ready") {
    return (
      <main id="main" className={`surface-dark container ${mod.page}`}>
        {back}
        <div className={styles.state}>
          {load.kind === "loading" && <HairlineShimmer rows={6} label="Loading the report" />}
          {load.kind === "notFound" && (
            <EmptyState title="Report not found" description="It may have been removed, or the link is wrong." />
          )}
          {load.kind === "failed" && (
            <ErrorState
              message={load.message}
              action={
                <button type="button" className="link-u t-nav" onClick={fetchReport}>
                  Try again
                </button>
              }
            />
          )}
        </div>
      </main>
    );
  }

  const { report } = load;
  const showPanel = report.status !== "CLOSED" || locked;

  return (
    <main id="main" className={`surface-dark container ${mod.page}`}>
      {back}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <div className={styles.grid}>
        <article className={styles.report} aria-labelledby="report-title">
          <header className={styles.head}>
            <div className={styles.tags}>
              <EyebrowTag>{STATUS_LABELS[report.status]}</EyebrowTag>
              <span className="t-eyebrow t-secondary">{CATEGORY_LABELS[report.category]}</span>
            </div>
            <h1 id="report-title" className={`t-h2 tabular ${styles.code}`}>
              {report.caseCode}
            </h1>
            <p className={styles.dates}>
              Submitted {formatDateTime(report.createdAt)}
              <span aria-hidden="true"> · </span>
              <br className={styles.mobileBreak} />
              Updated {formatDateTime(report.updatedAt)}
            </p>
          </header>

          <section className={styles.block} aria-labelledby="report-description">
            <h2 id="report-description" className={mod.subheading}>
              Description
            </h2>
            <p className={styles.description}>{report.description}</p>
          </section>

          <section className={styles.block} aria-labelledby="report-evidence-link">
            <h2 id="report-evidence-link" className={mod.subheading}>
              Evidence link
            </h2>
            {report.evidenceUrl ? (
              <>
                <LeaveSiteLink href={report.evidenceUrl} className={styles.evidence}>
                  {hostOf(report.evidenceUrl)}
                </LeaveSiteLink>
                {!safeExternalUrl(report.evidenceUrl) && (
                  <p className={styles.muted}>This link isn&apos;t http(s) and won&apos;t be opened.</p>
                )}
              </>
            ) : (
              <p className={styles.muted}>None provided.</p>
            )}
          </section>

          <Attachments report={report} />

          <section className={styles.block} aria-labelledby="report-history">
            <h2 id="report-history" className={mod.subheading}>
              History
            </h2>
            <StatusTimeline entries={timelineEntries(report)} />
          </section>
        </article>

        {showPanel && (
          <ActionPanel
            report={report}
            locked={locked}
            onUpdated={(updated) => {
              setLoad({ kind: "ready", report: updated });
              setAnnouncement(`Status changed to ${STATUS_LABELS[updated.status]}.`);
            }}
            onLocked={() => {
              setLocked(true);
              fetchReport();
            }}
            onStale={fetchReport}
          />
        )}
      </div>
    </main>
  );
}

function timelineEntries(report: ReportDetail): TimelineEntry[] {
  return [
    { key: "submitted", status: STATUS_LABELS.SUBMITTED, date: report.createdAt, author: "Reporter" },
    ...report.statusUpdates.map((u) => ({
      key: u.id,
      status: STATUS_LABELS[u.newStatus],
      note: u.note ?? undefined,
      date: u.createdAt,
      visibility: u.visibility,
      author: u.moderator?.email ?? "Unknown moderator",
    })),
  ];
}

// ── Attachments ──────────────────────────────────────────────────────────

type AttachmentState = { kind: "loading" } | { kind: "purged" } | { kind: "error"; message: string };

function Attachments({ report }: { report: ReportDetail }) {
  const { reportFailure } = useModSession();
  const [states, setStates] = useState<Record<string, AttachmentState>>({});

  const setState = (attachmentId: string, state: AttachmentState | null) =>
    setStates((s) => {
      const next = { ...s };
      if (state) next[attachmentId] = state;
      else delete next[attachmentId];
      return next;
    });

  // The signed link lasts 60 seconds, so it's fetched on click, never ahead of time.
  const view = async (attachmentId: string) => {
    setState(attachmentId, { kind: "loading" });
    const r = await getAttachmentUrl(report.id, attachmentId);
    if (r.ok) {
      const url = safeExternalUrl(r.data.url);
      if (url) {
        openInNewTab(url);
        setState(attachmentId, null);
      } else {
        setState(attachmentId, { kind: "error", message: "The download link wasn't valid." });
      }
      return;
    }
    reportFailure(r);
    // 410 is the brief's "gone"; this API answers 404 once the file row is deleted (the case was closed).
    if (r.status === 410 || r.status === 404) setState(attachmentId, { kind: "purged" });
    else setState(attachmentId, { kind: "error", message: r.message });
  };

  return (
    <section className={styles.block} aria-labelledby="report-attachments">
      <h2 id="report-attachments" className={mod.subheading}>
        Attachments
      </h2>
      {report.attachments.length === 0 ? (
        <p className={styles.muted}>
          {report.status === "CLOSED"
            ? "Evidence files were deleted when this case was closed."
            : "No files were attached."}
        </p>
      ) : (
        <ul className={styles.files} role="list">
          {report.attachments.map((a, i) => {
            const state = states[a.id];
            return (
              <li key={a.id} className={styles.file}>
                <div className={styles.fileInfo}>
                  <span>
                    {formatMimeType(a.mimeType)}
                    <span className="visually-hidden">, file {i + 1}</span>
                  </span>
                  <span className={`tabular ${styles.muted}`}>{formatBytes(a.sizeBytes)}</span>
                </div>
                {state?.kind === "purged" ? (
                  <span className={styles.muted} role="status">
                    Evidence purged
                  </span>
                ) : (
                  <button
                    type="button"
                    className="link-u t-nav"
                    onClick={() => void view(a.id)}
                    disabled={state?.kind === "loading"}
                    aria-busy={state?.kind === "loading" || undefined}
                  >
                    {state?.kind === "loading" ? "Opening…" : "View"}
                    <span className="visually-hidden">
                      {" "}
                      {formatMimeType(a.mimeType)} {i + 1} (opens in a new tab)
                    </span>
                  </button>
                )}
                {state?.kind === "error" && (
                  <p className={`${mod.alert} ${styles.fileError}`} role="alert">
                    {state.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Action panel ─────────────────────────────────────────────────────────

interface ActionPanelProps {
  report: ReportDetail;
  locked: boolean;
  onUpdated: (report: ReportDetail) => void;
  onLocked: () => void;
  onStale: () => void;
}

function ActionPanel({ report, locked, onUpdated, onLocked, onStale }: ActionPanelProps) {
  const { reportFailure } = useModSession();
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("PUBLIC");
  const [pending, setPending] = useState<ReportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const options = nextStatuses(report.status);

  const submit = async (newStatus: ReportStatus) => {
    setConfirmClose(false);
    setPending(newStatus);
    setError(null);
    const trimmed = note.trim();
    // Visibility applies to the update itself, note or not: an INTERNAL change stays off the reporter's timeline.
    const r = await updateReportStatus(report.id, { newStatus, visibility, ...(trimmed ? { note: trimmed } : {}) });
    setPending(null);
    if (r.ok) {
      setNote("");
      setVisibility("PUBLIC");
      onUpdated(r.data);
      return;
    }
    reportFailure(r);
    if (r.status === 423) {
      onLocked();
    } else if (r.status === 409) {
      // Someone else probably acted first: show why, and load what's there now.
      setError(`${r.message}. The report has been reloaded; check its status before trying again.`);
      onStale();
    } else {
      setError(r.message);
    }
  };

  if (locked) {
    return (
      <aside className={styles.panel} aria-label="Actions">
        <InfoCard
          title="Actions"
          items={[{ label: "Locked", value: <span role="alert">This case is closed and read-only.</span> }]}
        />
      </aside>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Actions">
      <form onSubmit={(e) => e.preventDefault()}>
        <InfoCard
          title="Actions"
          items={[
            { label: "Current status", value: STATUS_LABELS[report.status] },
            {
              label: "Update",
              value: (
                <div className={styles.noteFields}>
                  <UnderlineTextarea
                    label="Note (optional)"
                    maxChars={NOTE_MAX}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={4}
                    className={styles.note}
                  />
                  <UnderlineSelect
                    label="Visibility"
                    options={VISIBILITY_OPTIONS}
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
                    hint="Public notes are visible to the reporter."
                  />
                </div>
              ),
            },
            {
              label: "Move to",
              value: (
                <div className={styles.transitions}>
                  {options.map((status) => (
                    <BlockCTA
                      key={status}
                      onClick={() => (status === "CLOSED" ? setConfirmClose(true) : void submit(status))}
                      disabled={pending !== null}
                      aria-busy={pending === status || undefined}
                    >
                      {pending === status ? "Saving…" : status === "CLOSED" ? "Close case" : STATUS_LABELS[status]}
                    </BlockCTA>
                  ))}
                  {error && (
                    <p className={mod.alert} role="alert">
                      {error}
                    </p>
                  )}
                </div>
              ),
            },
          ]}
        />
      </form>

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Close this case?"
        description="Closing is permanent. Evidence files will be deleted."
        footer={
          <>
            <PillCTA onClick={() => void submit("CLOSED")}>Close permanently</PillCTA>
            <button type="button" className="link-u t-nav" onClick={() => setConfirmClose(false)} data-autofocus>
              Cancel
            </button>
          </>
        }
      >
        <p className={styles.muted}>
          {visibility === "PUBLIC" ? "The reporter will see this update" : "This update stays internal"}
          {note.trim() ? ", with your note." : "."}
        </p>
      </Modal>
    </aside>
  );
}
