import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/ui/Action";
import styles from "./SubmitButton.module.css";

export interface SubmitButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  children: ReactNode;
  loading?: boolean;
  /** Shown while loading, e.g. "Sending…". */
  loadingLabel?: ReactNode;
}

/**
 * Form submit: full column width, lime, 40px, radius 2px.
 * While loading it stays focusable (aria-disabled, clicks ignored) so focus
 * isn't lost, and a hairline runs along its bottom edge instead of a spinner.
 */
export function SubmitButton({ children, loading = false, loadingLabel, disabled, className, onClick, ...rest }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className={cx(styles.submit, className)}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      <span>{loading ? (loadingLabel ?? children) : children}</span>
      {loading && <span className={styles.progress} aria-hidden="true" />}
    </button>
  );
}
