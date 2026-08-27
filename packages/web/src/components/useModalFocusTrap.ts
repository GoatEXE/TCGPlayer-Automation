import { useEffect } from 'react';
import type { RefObject } from 'react';

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

interface UseModalFocusTrapOptions<
  TContainer extends HTMLElement,
  TInitialFocus extends HTMLElement,
> {
  containerRef: RefObject<TContainer | null>;
  initialFocusRef: RefObject<TInitialFocus | null>;
  onClose: () => void;
}

export function useModalFocusTrap<
  TContainer extends HTMLElement,
  TInitialFocus extends HTMLElement,
>({
  containerRef,
  initialFocusRef,
  onClose,
}: UseModalFocusTrapOptions<TContainer, TInitialFocus>) {
  useEffect(() => {
    initialFocusRef.current?.focus();
  }, [initialFocusRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements =
        containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusableElements?.length) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, onClose]);
}
