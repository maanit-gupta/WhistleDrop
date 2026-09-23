"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * While `active`: moves focus into `container`, keeps Tab / Shift+Tab inside
 * it, calls `onEscape` on Esc, and on deactivation returns focus to whatever
 * had it before (the trigger). Used by Modal and the mobile nav menu.
 */
export function useFocusTrap(
  container: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  // Latest callback without re-running the trap (which would move focus).
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const root = container.current;
    if (!active || !root) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

    const initial = root.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? root;
    if (initial === root && !root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (escapeRef.current) {
          e.preventDefault();
          escapeRef.current();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Deferred so a closing <dialog> is gone (and the page no longer inert)
      // before focus goes back to the trigger.
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    };
  }, [active, container]);
}
