"use client";

import { useRef, useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { FileDropzone, type DropzoneFile } from "@/components/ui/FileDropzone";
import { InfoCard } from "@/components/ui/InfoCard";
import { RevealHeadline } from "@/components/ui/Reveal";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { UnderlineCheckbox, UnderlineInput, UnderlineSelect, UnderlineTextarea } from "@/components/ui/UnderlineField";
import { signUpload, submitReport, uploadToSignedUrl, type ApiFailure } from "@/lib/client/api";
import { CATEGORY_LABELS, formatWait } from "@/lib/client/labels";
import {
  ALLOWED_UPLOAD_TYPES,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  MAX_ATTACHMENTS,
  MAX_UPLOAD_BYTES,
  REPORT_CATEGORIES,
  reportFormSchema,
  type ReportFormField,
} from "@/lib/validation.client";
import { CaseCodeScreen } from "./CaseCodeScreen";
import styles from "./report.module.css";

// PRIVACY: the case code returned by the API lives in this component's state
// only. It is never logged, stored, or put in a URL.

type UploadMimeType = (typeof ALLOWED_UPLOAD_TYPES)[number];
type Field = ReportFormField | "files" | "acknowledge";
type FieldErrors = Partial<Record<Field, string>>;

interface Upload extends DropzoneFile {
  file: File;
  /** From POST /api/uploads/sign once the file is in storage. */
  token?: string;
  tokenIssuedAt?: number;
}

const CATEGORY_OPTIONS = REPORT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

/** Tokens live 30 minutes; re-upload a little before that rather than risk expiry mid-submit. */
const TOKEN_REUSE_MS = 25 * 60 * 1000;

const FIELD_IDS: Record<ReportFormField, string> = {
  category: "report-category",
  description: "report-description",
  evidenceUrl: "report-evidence-url",
};

/** Friendly text for a server VALIDATION_ERROR, keyed by the field its message names. */
const SERVER_FIELD_MESSAGES: Record<Field, string> = {
  category: "Choose a category.",
  description: `Write between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX.toLocaleString("en")} characters.`,
  evidenceUrl: "Enter a full link starting with http:// or https://.",
  files: "One of the files couldn't be attached. Remove it and try again.",
  acknowledge: "",
};

export const DEMO_ACKNOWLEDGEMENT = "I understand this is a demo and I'm not submitting real information.";
const ACKNOWLEDGE_ID = "report-demo-acknowledge";

interface FormError {
  title: string;
  message: string;
}

function failureMessage(failure: ApiFailure): FormError {
  switch (failure.status) {
    case 429:
      return {
        title: "Too many attempts",
        message: `Please wait and try again ${formatWait(failure.retryAfterSeconds)}. Nothing you've entered is lost.`,
      };
    case 503:
      return { title: "Reporting is paused", message: "WhistleDrop can't accept reports right now. Please try again later." };
    case 0:
      return { title: "No connection", message: failure.message };
    default:
      return {
        title: "Your report wasn't sent",
        message: "Something went wrong on our side. Nothing was saved; please try again.",
      };
  }
}

/** "description: Too small…" → "description". The server reports the first issue only. */
function serverField(message: string): Field | null {
  const path = message.split(":")[0]?.split(".")[0];
  if (path === "category" || path === "description" || path === "evidenceUrl") return path;
  if (path === "attachments") return "files";
  return null;
}

let uploadCounter = 0;

export interface ReportFormProps {
  /** DEMO_MODE instance: the reporter must tick the demo acknowledgement before submitting. */
  demoMode?: boolean;
}

export function ReportForm({ demoMode = false }: ReportFormProps) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");
  const [caseCode, setCaseCode] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const busy = phase !== "idle";

  const patchUpload = (id: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const clearError = (field: Field) => {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
    setFormError(null);
  };

  const focusField = (field: Field) => {
    if (field === "files") return;
    document.getElementById(field === "acknowledge" ? ACKNOWLEDGE_ID : FIELD_IDS[field])?.focus();
  };

  /** Signs and uploads every file that has no usable token yet. Returns the tokens, or null on failure. */
  const uploadAll = async (): Promise<string[] | null> => {
    const now = Date.now();
    const results = await Promise.all(
      uploads.map(async (u): Promise<string | null> => {
        if (u.token && u.tokenIssuedAt && now - u.tokenIssuedAt < TOKEN_REUSE_MS) return u.token;

        patchUpload(u.id, { status: "uploading", progress: 0, error: undefined, token: undefined });
        const signed = await signUpload({ mimeType: u.file.type as UploadMimeType, sizeBytes: u.file.size });
        if (!signed.ok) {
          patchUpload(u.id, { status: "error", error: signed.status === 429 ? "Try again later" : "Couldn't start upload" });
          if (signed.status === 429 || signed.status === 503 || signed.status === 0) setFormError(failureMessage(signed));
          return null;
        }
        const put = await uploadToSignedUrl(signed.data.uploadUrl, u.file, {
          onProgress: (fraction) => patchUpload(u.id, { progress: fraction }),
        });
        if (!put.ok) {
          patchUpload(u.id, { status: "error", error: "Upload failed" });
          return null;
        }
        patchUpload(u.id, { status: "done", progress: 1, token: signed.data.uploadToken, tokenIssuedAt: Date.now() });
        return signed.data.uploadToken;
      }),
    );
    return results.every((t): t is string => t !== null) ? results : null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    const trimmedUrl = evidenceUrl.trim();
    const parsed = reportFormSchema.safeParse({
      category,
      description,
      evidenceUrl: trimmedUrl === "" ? undefined : trimmedUrl,
    });
    const needsAcknowledgement = demoMode && !acknowledged;
    if (!parsed.success || needsAcknowledgement) {
      const next: FieldErrors = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        const field = issue.path[0] as ReportFormField;
        next[field] ??= issue.message;
      }
      if (needsAcknowledgement) next.acknowledge = "Tick this box to confirm before submitting.";
      setErrors(next);
      const first = (["category", "description", "evidenceUrl", "acknowledge"] as const).find((f) => next[f]);
      if (first) focusField(first);
      return;
    }
    setErrors({});

    let tokens: string[] = [];
    if (uploads.length > 0) {
      setPhase("uploading");
      const uploaded = await uploadAll();
      if (!uploaded) {
        setPhase("idle");
        setErrors({ files: "Some files didn't upload. Try again, or remove them to send without." });
        return;
      }
      tokens = uploaded;
    }

    setPhase("sending");
    const result = await submitReport({
      ...parsed.data,
      ...(tokens.length > 0 && { attachments: tokens }),
    });
    setPhase("idle");

    if (result.ok) {
      setCaseCode(result.data.caseCode);
      // Drop everything that was typed: the case code screen replaces the form.
      setCategory("");
      setDescription("");
      setEvidenceUrl("");
      setUploads([]);
      sectionRef.current?.scrollIntoView({ block: "start" });
      return;
    }

    switch (result.code) {
      case "VALIDATION_ERROR": {
        const field = serverField(result.message);
        if (field) {
          setErrors({ [field]: SERVER_FIELD_MESSAGES[field] });
          focusField(field);
        } else {
          setFormError({ title: "Check the form", message: "Something in the form isn't valid. Please review it and try again." });
        }
        return;
      }
      case "INVALID_UPLOAD_TOKEN":
      case "UPLOAD_TOKEN_USED":
        // Expired or already used: upload the files again on the next attempt.
        setUploads((list) => list.map((u) => ({ ...u, token: undefined, tokenIssuedAt: undefined, status: "queued", progress: 0 })));
        setErrors({ files: "Your uploads expired. Submit again to re-upload them." });
        return;
      case "INVALID_UPLOAD":
        setErrors({
          files:
            "One of your files couldn't be processed: its contents don't match its type, or the image is damaged. Remove it and try again.",
        });
        return;
      default:
        setFormError(failureMessage(result));
    }
  };

  const addFiles = (files: File[]) => {
    clearError("files");
    setUploads((list) => [
      ...list,
      ...files.map((file) => ({
        id: `upload-${++uploadCounter}`,
        name: file.name,
        sizeBytes: file.size,
        progress: 0,
        status: "queued" as const,
        file,
      })),
    ]);
  };

  return (
    <section ref={sectionRef} className={`surface-dark section ${styles.formSection}`} aria-labelledby="report-form-title">
      <div className={`container ${styles.columns}`}>
        <div className={styles.main}>
          {caseCode ? (
            <CaseCodeScreen code={caseCode} onDone={() => setCaseCode(null)} />
          ) : (
            <>
              <RevealHeadline
                id="report-form-title"
                className={`t-h2 ${styles.formTitle}`}
                lines={["Tell Us What", "Happened"]}
              />
              <form className={styles.form} onSubmit={onSubmit} noValidate aria-describedby="report-required-note">
                <p id="report-required-note" className={styles.requiredNote}>
                  Fields marked * are required.
                </p>
                <UnderlineSelect
                  id={FIELD_IDS.category}
                  label="Category"
                  required
                  placeholder="Choose a category"
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    clearError("category");
                  }}
                  error={errors.category}
                />
                <UnderlineTextarea
                  id={FIELD_IDS.description}
                  label="Description"
                  required
                  hint="What happened, where and when. Leave out your name and anything that points to you."
                  minChars={DESCRIPTION_MIN}
                  maxChars={DESCRIPTION_MAX}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    clearError("description");
                  }}
                  error={errors.description}
                />
                <UnderlineInput
                  id={FIELD_IDS.evidenceUrl}
                  label="Evidence link"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  hint="Optional. http(s) only. Whoever runs that site can see who opens the link."
                  autoComplete="off"
                  spellCheck={false}
                  value={evidenceUrl}
                  onChange={(e) => {
                    setEvidenceUrl(e.target.value);
                    clearError("evidenceUrl");
                  }}
                  error={errors.evidenceUrl}
                />
                <FileDropzone
                  label="Evidence files"
                  hint={`Optional. Up to ${MAX_ATTACHMENTS} files, JPEG, PNG, WebP or PDF, ${MAX_UPLOAD_BYTES / 1024 / 1024} MB each. Image metadata is removed; PDF metadata is not, so clean PDFs first.`}
                  files={uploads}
                  onAdd={addFiles}
                  onRemove={(id) => {
                    clearError("files");
                    setUploads((list) => list.filter((u) => u.id !== id));
                  }}
                  onReject={(reasons) => setErrors((e) => ({ ...e, files: reasons.join(" · ") }))}
                  error={errors.files}
                  accept={ALLOWED_UPLOAD_TYPES}
                  maxFiles={MAX_ATTACHMENTS}
                  maxBytes={MAX_UPLOAD_BYTES}
                  disabled={busy}
                />

                {demoMode && (
                  <UnderlineCheckbox
                    id={ACKNOWLEDGE_ID}
                    label={DEMO_ACKNOWLEDGEMENT}
                    required
                    checked={acknowledged}
                    onChange={(e) => {
                      setAcknowledged(e.target.checked);
                      clearError("acknowledge");
                    }}
                    error={errors.acknowledge}
                  />
                )}

                {formError && <ErrorState title={formError.title} message={formError.message} className={styles.formError} />}

                <SubmitButton
                  loading={busy}
                  loadingLabel={phase === "uploading" ? "Uploading files…" : "Sending…"}
                >
                  Submit Report
                </SubmitButton>
              </form>
            </>
          )}
        </div>

        <aside className={styles.aside} aria-label="About your report">
          <InfoCard
            items={[
              {
                label: "What happens next",
                value:
                  "A moderator picks up your report. It moves from Submitted to Under review, then Resolved or Dismissed, and finally Closed. Check it any time with your case code.",
              },
              {
                label: "What we store",
                value:
                  "What you enter here and your files, with image metadata removed. No IP address, cookies, email or account. Closing the case deletes the files.",
              },
              {
                label: "Keep your code safe",
                value:
                  "It's shown once and can't be recovered. Anyone who has it can read your report, so keep it somewhere private.",
              },
            ]}
          />
        </aside>
      </div>
    </section>
  );
}
