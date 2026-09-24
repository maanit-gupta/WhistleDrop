"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EyebrowTag } from "@/components/ui/EyebrowTag";
import { HairlineShimmer } from "@/components/ui/HairlineShimmer";
import { InfoCard, type InfoItem } from "@/components/ui/InfoCard";
import { LeaveSiteLink } from "@/components/ui/LeaveSiteModal";
import { RevealHeadline } from "@/components/ui/Reveal";
import { StatusTimeline, type TimelineEntry } from "@/components/ui/StatusTimeline";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UnderlineInput, UnderlineTextarea } from "@/components/ui/UnderlineField";
import {
  lookupReport,
  sendReporterMessage,
  type ApiFailure,
  type PublicConversationEntry,
  type PublicReport,
} from "@/lib/client/api";
import { normalizeCaseCode } from "@/lib/client/caseCode";
import { useCaseCodeHandoff } from "@/lib/client/caseCodeHandoff";
import { CATEGORY_LABELS, STATUS_LABELS, formatDate, formatWait } from "@/lib/client/labels";
import styles from "./track.module.css";

// PRIVACY: the case code is held in this component's state only. It goes into
// the body of the lookup and message requests and nowhere else: never a URL
// (the page's or the API's), history, storage or the console.

type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; report: PublicReport; caseCode: string }
  | { kind: "failed"; title: string; message: string };

const MESSAGE_MAX = 2000;
const CLOSED_NOTICE = "This case is closed. The conversation is read-only.";

function failureView(failure: ApiFailure): View {
  switch (failure.status) {
    case 404:
      // Unknown and malformed codes get the same answer from the server; say nothing more here either.
      return { kind: "failed", title: "No case matches this code.", message: "Check the code and try again." };
    case 429:
      return { kind: "failed", title: "Too many lookups", message: `Please try again ${formatWait(failure.retryAfterSeconds)}.` };
    case 503:
      return { kind: "failed", title: "Lookups are paused", message: "Case lookup isn't available right now. Please try again later." };
    case 0:
      return { kind: "failed", title: "No connection", message: failure.message };
    default:
      return { kind: "failed", title: "Something went wrong", message: "We couldn't check your case. Please try again." };
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export function TrackCase() {
  const handoff = useCaseCodeHandoff();
  // A code handed over from Home or the report screen (memory only); a refresh starts empty.
  const [pending] = useState(() => handoff.peek());
  const [input, setInput] = useState(pending ?? "");
  const [inputError, setInputError] = useState<string | null>(null);
  const [view, setView] = useState<View>(pending ? { kind: "loading" } : { kind: "idle" });
  const controller = useRef<AbortController | null>(null);

  /** Starts a lookup, cancelling any earlier one; the result lands in `view`. */
  const lookup = (code: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    void lookupReport(code, { signal: current.signal }).then((result) => {
      if (!current.signal.aborted) {
        setView(result.ok ? { kind: "found", report: result.data, caseCode: code } : failureView(result));
      }
    });
  };

  // The person already pressed "Track" on the previous page: look it up straight away.
  useEffect(() => {
    handoff.clear();
    if (pending) lookup(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount; `pending` is fixed
  }, []);

  // Drop a lookup still in flight when leaving the page.
  useEffect(() => () => controller.current?.abort(), []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCaseCode(input);
    if (!code) {
      setInputError("Case codes look like WD-XXXX-XXXX.");
      return;
    }
    setInput(code);
    setView({ kind: "loading" });
    lookup(code);
  };

  const clear = () => {
    controller.current?.abort();
    setInput("");
    setInputError(null);
    setView({ kind: "idle" });
    document.getElementById("track-code")?.focus();
  };

  return (
    <section className={`surface-dark section ${styles.section}`} aria-labelledby="track-form-title">
      <div className="container">
        <h2 id="track-form-title" className="visually-hidden">
          Look up a case
        </h2>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <UnderlineInput
            id="track-code"
            label="Case code"
            placeholder="WD-XXXX-XXXX"
            hint="Upper or lower case, with or without dashes."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInputError(null);
            }}
            error={inputError ?? undefined}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
          />
          <SubmitButton className={styles.button} loading={view.kind === "loading"} loadingLabel="Checking…">
            Track
          </SubmitButton>
        </form>

        <p className="visually-hidden" aria-live="polite">
          {view.kind === "found" ? `Case found. Status: ${STATUS_LABELS[view.report.status]}.` : ""}
        </p>
        <div className={styles.result}>
          {view.kind === "idle" && (
            <EmptyState
              title="Nothing to show yet"
              description="Enter your case code above. It stays on this page: it's never saved or added to the address bar."
            />
          )}
          {view.kind === "loading" && <HairlineShimmer rows={4} label="Looking up your case" />}
          {view.kind === "failed" && <ErrorState title={view.title} message={view.message} />}
          {view.kind === "found" && (
            <CaseDetails
              report={view.report}
              caseCode={view.caseCode}
              onClear={clear}
              onReport={(report) => setView({ kind: "found", report, caseCode: view.caseCode })}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** The submission, then the conversation: messages and status changes, oldest first. */
function conversationEntries(report: PublicReport): TimelineEntry[] {
  const entry = (item: PublicConversationEntry, i: number): TimelineEntry =>
    item.type === "status"
      ? { key: `c-${i}`, status: STATUS_LABELS[item.status], note: item.note, date: item.createdAt }
      : item.author === "REVIEW_TEAM"
        ? { key: `c-${i}`, status: "Review team", tone: "accent", note: item.body, date: item.createdAt }
        : { key: `c-${i}`, status: "You", tone: "muted", note: item.body, date: item.createdAt };
  return [
    { key: "submitted", status: STATUS_LABELS.SUBMITTED, note: "You sent your report.", date: report.createdAt },
    ...report.conversation.map(entry),
  ];
}

interface CaseDetailsProps {
  report: PublicReport;
  caseCode: string;
  onClear: () => void;
  onReport: (report: PublicReport) => void;
}

function CaseDetails({ report, caseCode, onClear, onReport }: CaseDetailsProps) {
  const closedUpdate =
    report.status === "CLOSED" ? report.conversation.findLast((c) => c.type === "status" && c.status === "CLOSED") : undefined;

  const items: InfoItem[] = [
    { label: "Category", value: CATEGORY_LABELS[report.category] },
    { label: "Submitted", value: formatDate(report.createdAt) },
    { label: "Status", value: STATUS_LABELS[report.status] },
  ];
  if (report.status === "CLOSED") {
    items.push({
      label: "Closed",
      value: closedUpdate
        ? `${formatDate(closedUpdate.createdAt)}. Evidence files have been deleted.`
        : "Evidence files have been deleted.",
    });
  }
  if (report.evidenceUrl) {
    items.push({
      label: "Evidence link",
      value: <LeaveSiteLink href={report.evidenceUrl}>{hostOf(report.evidenceUrl)}</LeaveSiteLink>,
    });
  }

  return (
    <div className={styles.details}>
      <div className={styles.detailsHead}>
        <EyebrowTag>{STATUS_LABELS[report.status]}</EyebrowTag>
        <button type="button" className={`link-u t-nav ${styles.clear}`} onClick={onClear}>
          Clear from screen
        </button>
      </div>
      <RevealHeadline className={`t-h2 ${styles.detailsTitle}`} lines={["Your Case"]} />

      <div className={styles.summary}>
        <InfoCard items={items} />
        <details className={styles.description}>
          <summary className="t-nav">Show what you wrote</summary>
          <p>{report.description}</p>
        </details>
      </div>

      <section className={styles.conversation} aria-labelledby="track-conversation">
        <h3 id="track-conversation" className={styles.subheading}>
          Conversation
        </h3>
        <p className={styles.lede}>
          Messages between you and the review team. Reviewers never see who you are, and you only see them as the
          review team.
        </p>
        <StatusTimeline entries={conversationEntries(report)} currentIndex={-1} />
        {report.status === "CLOSED" ? (
          <p className={styles.closed} role="status">
            {CLOSED_NOTICE}
          </p>
        ) : (
          <ReplyComposer
            caseCode={caseCode}
            onSent={(conversation) => onReport({ ...report, conversation })}
            onClosed={() => onReport({ ...report, status: "CLOSED" })}
          />
        )}
      </section>
    </div>
  );
}

interface ReplyComposerProps {
  caseCode: string;
  onSent: (conversation: PublicReport["conversation"]) => void;
  onClosed: () => void;
}

function ReplyComposer({ caseCode, onSent, onClosed }: ReplyComposerProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) {
      setError("Write a message first.");
      return;
    }
    setBusy(true);
    setError(null);
    setAnnouncement("");
    const result = await sendReporterMessage({ caseCode, body: text });
    setBusy(false);
    if (result.ok) {
      setBody("");
      setAnnouncement("Message sent.");
      onSent(result.data.conversation);
      return;
    }
    switch (result.status) {
      case 423:
        onClosed();
        return;
      case 429:
        setError(`You've sent several messages in a short time. Please try again ${formatWait(result.retryAfterSeconds)}.`);
        return;
      case 404:
        setError("This case can't be found any more. Look it up again with your code.");
        return;
      case 400:
        setError("That message wasn't accepted. It must be 1 to 2,000 characters.");
        return;
      case 0:
        setError(result.message);
        return;
      default:
        setError("Your message wasn't sent. Please try again.");
    }
  };

  return (
    <form className={styles.composer} onSubmit={onSubmit} noValidate aria-label="Reply to the review team">
      <UnderlineTextarea
        label="Your reply"
        hint="Don't include your name or anything that could identify you."
        maxChars={MESSAGE_MAX}
        rows={4}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
        error={error ?? undefined}
        autoComplete="off"
      />
      <SubmitButton className={styles.send} loading={busy} loadingLabel="Sending…">
        Send
      </SubmitButton>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </form>
  );
}
