"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cx } from "@/components/ui/Action";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row. Put data-autofocus on the one that should get focus first. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal dialog on the native <dialog> (top layer, inert background) plus a
 * focus trap: Tab cycles inside, Esc and a backdrop click close it, and focus
 * returns to the element that opened it.
 */
export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Declared before the focus trap: its cleanup must close the dialog before
  // the trap's cleanup returns focus to the trigger.
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useFocusTrap(ref, open, onClose);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className={styles.description}>
              {description}
            </div>
          )}
          {children}
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
