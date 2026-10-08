"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Accessible modal surface (audit F01, F13): moves focus into the dialog, keeps Tab and
 * Shift+Tab inside it, makes the rest of the page inert, closes on Escape, and returns focus
 * to the element that opened it. Rendered in a portal on document.body.
 */

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("inert") && element.getAttribute("aria-hidden") !== "true",
  );
}

export function ModalDialog({
  label,
  onClose,
  children,
  placement = "right",
  className,
  overlayClassName,
  testId,
  initialFocusSelector,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "right" | "center";
  className?: string;
  overlayClassName?: string;
  testId?: string;
  /** CSS selector (inside the dialog) for the element to focus first. */
  initialFocusSelector?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = dialog.closest<HTMLElement>("[data-modal-root]");

    // Inert background: everything on <body> except this dialog's portal container.
    const inertTargets = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== container && !element.hasAttribute("inert"),
    );
    for (const element of inertTargets) element.setAttribute("inert", "");

    const preferred = initialFocusSelector
      ? dialog.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    (preferred ?? focusableWithin(dialog)[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableWithin(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      for (const element of inertTargets) element.removeAttribute("inert");
      if (opener && opener.isConnected) opener.focus();
    };
  }, [initialFocusSelector]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div data-modal-root="" data-testid={testId} className={cn("fixed inset-0 z-50", overlayClassName)}>
      <div aria-hidden="true" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "outline-none",
          placement === "right"
            ? "absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-background shadow-2xl"
            : "absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
