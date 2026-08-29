import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BlueprintButton } from './BlueprintButton';
import { BlueprintRegistrationMarks } from './BlueprintPanel';
import { classNames } from './classNames';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface BlueprintDialogProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
  closeLabel?: string;
  showCloseButton?: boolean;
}

/**
 * A portal-based modal dialog with Escape/backdrop dismissal and a local tab
 * loop. Use a close button in the footer for any flow where dismissal is not
 * an appropriate cancel action.
 */
export function BlueprintDialog({
  children,
  className,
  closeLabel = 'Close dialog',
  footer,
  onClose,
  open,
  showCloseButton = true,
  title,
}: BlueprintDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    const previousFocusedElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || dialogRef.current === null) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute('aria-hidden'));

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      if (previousFocusedElement instanceof HTMLElement) {
        previousFocusedElement.focus();
      }
    };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="industry-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={classNames(
          'industry-blueprint',
          'industry-dialog',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
      >
        <header className="industry-dialog__header">
          <h2 id={titleId} className="industry-dialog__title">
            {title}
          </h2>
          {showCloseButton ? (
            <BlueprintButton
              variant="ghost"
              className="industry-dialog__close"
              onClick={onClose}
              aria-label={closeLabel}
              icon={<X aria-hidden="true" strokeWidth={1.5} />}
            />
          ) : null}
        </header>
        <div id={bodyId} className="industry-dialog__body">
          {children}
        </div>
        {footer ? (
          <footer className="industry-dialog__footer">{footer}</footer>
        ) : null}
        <BlueprintRegistrationMarks />
      </div>
    </div>,
    document.body,
  );
}
