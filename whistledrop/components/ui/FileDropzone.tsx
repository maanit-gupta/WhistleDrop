"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./FileDropzone.module.css";
import fieldStyles from "./UnderlineField.module.css";

export type DropzoneFileStatus = "queued" | "uploading" | "done" | "error";

export interface DropzoneFile {
  id: string;
  name: string;
  sizeBytes: number;
  /** 0–1; drawn as a hairline under the file. */
  progress: number;
  status: DropzoneFileStatus;
  error?: string;
}

export interface FileDropzoneProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Files already added (the parent owns upload state). */
  files: readonly DropzoneFile[];
  /** Called with accepted files; rejected ones are reported through onReject. */
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  /** Called with human-readable reasons for files that were not accepted. */
  onReject?: (reasons: string[]) => void;
  /** MIME types, e.g. ["image/jpeg", "application/pdf"]. */
  accept: readonly string[];
  maxFiles: number;
  maxBytes: number;
  disabled?: boolean;
  className?: string;
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const STATUS_TEXT: Record<DropzoneFileStatus, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Failed",
};

/**
 * File picker + drop target in the underline style. Pre-checks type, size and
 * count in the browser for fast feedback; the server re-checks everything
 * (real file type, size, metadata stripping) when the report is submitted.
 */
export function FileDropzone({
  label,
  hint,
  error,
  required,
  files,
  onAdd,
  onRemove,
  onReject,
  accept,
  maxFiles,
  maxBytes,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = files.length >= maxFiles;
  const blocked = disabled || full;

  const take = (list: FileList | null) => {
    if (!list || blocked) return;
    const accepted: File[] = [];
    const reasons: string[] = [];
    for (const file of Array.from(list)) {
      if (!accept.includes(file.type)) reasons.push(`${file.name}: this file type isn't accepted`);
      else if (file.size > maxBytes) reasons.push(`${file.name}: larger than ${formatBytes(maxBytes)}`);
      else if (file.size === 0) reasons.push(`${file.name}: the file is empty`);
      else if (files.length + accepted.length >= maxFiles) reasons.push(`${file.name}: at most ${maxFiles} files`);
      else accepted.push(file);
    }
    if (accepted.length) onAdd(accepted);
    if (reasons.length) onReject?.(reasons);
    if (inputRef.current) inputRef.current.value = "";
  };

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx(fieldStyles.field, className)} data-invalid={!!error || undefined}>
      <span className={fieldStyles.label} id={`${inputId}-label`}>
        {label}
        {required && (
          <span className={fieldStyles.required} aria-hidden="true">
            {" "}*
          </span>
        )}
      </span>

      <div
        className={styles.zone}
        data-dragging={dragging || undefined}
        data-blocked={blocked || undefined}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple={maxFiles - files.length > 1}
          accept={accept.join(",")}
          className="visually-hidden"
          disabled={blocked}
          aria-labelledby={`${inputId}-label ${inputId}-cta`}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => take(e.target.files)}
        />
        <label htmlFor={inputId} className={styles.cta} id={`${inputId}-cta`}>
          {full ? (
            `Maximum of ${maxFiles} files added`
          ) : (
            <>
              <span className={styles.browse}>Choose files</span>
              <span className={styles.or}> or drop them here</span>
            </>
          )}
        </label>
        <span className={styles.count} aria-hidden="true">
          {files.length}/{maxFiles}
        </span>
      </div>

      <div className={fieldStyles.messages}>
        <div>
          {error && (
            <p id={errorId} className={fieldStyles.error}>
              <span aria-hidden="true">! </span>
              {error}
            </p>
          )}
          {hint && (
            <p id={hintId} className={fieldStyles.hint}>
              {hint}
            </p>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <ul className={styles.files} role="list" aria-label="Selected files">
          {files.map((f) => (
            <li key={f.id} className={styles.file} data-status={f.status}>
              <div className={styles.fileRow}>
                <span className={styles.fileName}>{f.name}</span>
                <span className={styles.fileMeta}>
                  {formatBytes(f.sizeBytes)} · <span aria-live="polite">{f.status === "error" && f.error ? f.error : STATUS_TEXT[f.status]}</span>
                </span>
                <button
                  type="button"
                  className={cx(styles.remove, "link-u")}
                  onClick={() => onRemove(f.id)}
                  disabled={disabled || f.status === "uploading"}
                >
                  Remove<span className="visually-hidden"> {f.name}</span>
                </button>
              </div>
              <span
                className={styles.progress}
                role="progressbar"
                aria-label={`${f.name} upload`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(f.progress * 100)}
              >
                <span className={styles.progressFill} style={{ transform: `scaleX(${Math.max(0, Math.min(1, f.progress))})` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
