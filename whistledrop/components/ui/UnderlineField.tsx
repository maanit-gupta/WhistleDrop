"use client";

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "@/components/ui/Action";
import styles from "./UnderlineField.module.css";

// Underline-style form fields: 11px label above, no box, a 1px bottom border
// that turns lime on focus. Every control has a real <label> (or <legend>),
// errors are linked with aria-describedby and flagged with aria-invalid.

interface ShellProps {
  label: ReactNode;
  /** Adds a visible "*" (hidden from screen readers, which get `required`). */
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}

interface FieldIds {
  id: string;
  hintId?: string;
  errorId?: string;
  describedBy?: string;
}

function useFieldIds(idProp: string | undefined, hint: ReactNode, error: ReactNode, extra?: string): FieldIds {
  const auto = useId();
  const id = idProp ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId, extra].filter(Boolean).join(" ") || undefined;
  return { id, hintId, errorId, describedBy };
}

function Label({ htmlFor, children, required }: { htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={styles.label}>
      {children}
      {required && (
        <span className={styles.required} aria-hidden="true">
          {" "}*
        </span>
      )}
    </label>
  );
}

function Messages({ hint, hintId, error, errorId, aside }: { hint?: ReactNode; hintId?: string; error?: ReactNode; errorId?: string; aside?: ReactNode }) {
  if (!hint && !error && !aside) return null;
  return (
    <div className={styles.messages}>
      <div>
        {error && (
          <p id={errorId} className={styles.error}>
            <span aria-hidden="true">! </span>
            {error}
          </p>
        )}
        {hint && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}
      </div>
      {aside}
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────

export type UnderlineInputProps = ShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export function UnderlineInput({ label, required, hint, error, className, id: idProp, ...input }: UnderlineInputProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error);
  return (
    <div className={cx(styles.field, className)} data-invalid={!!error || undefined}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <input
        id={id}
        className={styles.control}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      <Messages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

/** Date input in the same style (native picker, dark scheme). */
export function UnderlineDate(props: Omit<UnderlineInputProps, "type">) {
  return <UnderlineInput {...props} type="date" />;
}

// ── Textarea ─────────────────────────────────────────────────────────────

export type UnderlineTextareaProps = ShellProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
    /** Shows a live "n / max" counter; also sets maxLength unless `enforceMax` is false. */
    maxChars?: number;
    /** Min characters, shown in the counter until reached. */
    minChars?: number;
    enforceMax?: boolean;
  };

export function UnderlineTextarea({
  label,
  required,
  hint,
  error,
  className,
  id: idProp,
  maxChars,
  minChars,
  enforceMax = true,
  onChange,
  value,
  defaultValue,
  ...textarea
}: UnderlineTextareaProps) {
  const counterId = useId();
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error, maxChars ? counterId : undefined);
  const [uncontrolledLength, setUncontrolledLength] = useState(String(defaultValue ?? "").length);
  const length = value !== undefined ? String(value).length : uncontrolledLength;
  // Only announce the count when it matters, not on every keystroke.
  const nearLimit = maxChars !== undefined && length >= maxChars * 0.9;
  const belowMin = minChars !== undefined && length > 0 && length < minChars;

  return (
    <div className={cx(styles.field, className)} data-invalid={!!error || undefined}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <textarea
        id={id}
        className={cx(styles.control, styles.textarea)}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        maxLength={maxChars && enforceMax ? maxChars : undefined}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          if (value === undefined) setUncontrolledLength(e.target.value.length);
          onChange?.(e);
        }}
        {...textarea}
      />
      <Messages
        hint={hint}
        hintId={hintId}
        error={error}
        errorId={errorId}
        aside={
          maxChars !== undefined && (
            <p id={counterId} className={cx(styles.counter, nearLimit && styles.counterNear)} aria-live={nearLimit ? "polite" : "off"}>
              <span className="tabular">{length.toLocaleString()}</span> / {maxChars.toLocaleString()}
              {belowMin && <span> · at least {minChars}</span>}
              <span className="visually-hidden"> characters</span>
            </p>
          )
        }
      />
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────

export interface FieldOption<V extends string = string> {
  value: V;
  label: ReactNode;
}

export type UnderlineSelectProps = ShellProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "multiple" | "children"> & {
    options: readonly FieldOption<string>[];
    /** First, empty option (e.g. "Choose a category"). */
    placeholder?: string;
  };

export function UnderlineSelect({ label, required, hint, error, className, id: idProp, options, placeholder, ...select }: UnderlineSelectProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error);
  return (
    <div className={cx(styles.field, className)} data-invalid={!!error || undefined}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div className={styles.selectWrap}>
        <select
          id={id}
          className={cx(styles.control, styles.select)}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...select}
        >
          {placeholder !== undefined && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {typeof o.label === "string" ? o.label : o.value}
            </option>
          ))}
        </select>
        <span className={styles.chevron} aria-hidden="true" />
      </div>
      <Messages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

// ── Multi-select ─────────────────────────────────────────────────────────

export interface UnderlineMultiSelectProps<V extends string> extends ShellProps {
  options: readonly FieldOption<V>[];
  value: readonly V[];
  onChange: (value: V[]) => void;
  name?: string;
  disabled?: boolean;
}

/** A fieldset of toggle chips (native checkboxes), underlined like the other fields. */
export function UnderlineMultiSelect<V extends string>({
  label,
  required,
  hint,
  error,
  className,
  options,
  value,
  onChange,
  name,
  disabled,
}: UnderlineMultiSelectProps<V>) {
  const { id, hintId, errorId, describedBy } = useFieldIds(undefined, hint, error);
  const toggle = (v: V) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset
      className={cx(styles.field, styles.fieldset, className)}
      data-invalid={!!error || undefined}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className={styles.label}>
        {label}
        {required && (
          <>
            <span className={styles.required} aria-hidden="true">
              {" "}*
            </span>
            <span className="visually-hidden"> (required)</span>
          </>
        )}
      </legend>
      <div className={cx(styles.control, styles.chips)}>
        {options.map((o) => {
          const optionId = `${id}-${o.value}`;
          const checked = value.includes(o.value);
          return (
            <span key={o.value} className={styles.chip} data-checked={checked || undefined}>
              <input
                id={optionId}
                type="checkbox"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => toggle(o.value)}
                className={styles.chipInput}
              />
              <label htmlFor={optionId}>{o.label}</label>
            </span>
          );
        })}
      </div>
      <Messages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </fieldset>
  );
}

// ── Checkbox ─────────────────────────────────────────────────────────────

export type UnderlineCheckboxProps = Omit<ShellProps, "required"> &
  Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
    /** Adds a visible "*" and the native `required`. */
    required?: boolean;
  };

/** A single native checkbox with its label beside it, e.g. an acknowledgement. */
export function UnderlineCheckbox({ label, required, hint, error, className, id: idProp, ...input }: UnderlineCheckboxProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error);
  return (
    <div className={cx(styles.field, className)} data-invalid={!!error || undefined}>
      <div className={styles.check}>
        <input
          id={id}
          type="checkbox"
          className={styles.checkInput}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        <label htmlFor={id} className={styles.checkLabel}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
      </div>
      <Messages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}
