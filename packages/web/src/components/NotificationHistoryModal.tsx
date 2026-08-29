import { Bell } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { NotificationEvent } from '../api/types';
import { BlueprintButton, BlueprintDialog } from '../ui';
import { NotificationHistoryPanel } from './NotificationHistoryPanel';

interface NotificationHistoryModalProps {
  events: NotificationEvent[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
}

function useUtilityDialogInitialFocus(contentRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const timer = window.setTimeout(() => {
      contentRef.current
        ?.closest<HTMLElement>('.industry-dialog')
        ?.querySelector<HTMLButtonElement>('.industry-dialog__close')
        ?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contentRef]);
}

export function NotificationHistoryModal({
  events,
  loading,
  error,
  onClose,
}: NotificationHistoryModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  useUtilityDialogInitialFocus(contentRef);

  return (
    <BlueprintDialog
      open
      title={
        <span className="utility-dialog-title">
          <Bell aria-hidden="true" size={18} strokeWidth={1.5} />
          Notifications
        </span>
      }
      className="utility-dialog utility-notification-history-dialog"
      closeLabel="Close notifications"
      onClose={onClose}
      footer={
        <BlueprintButton variant="secondary" onClick={onClose}>
          Close
        </BlueprintButton>
      }
    >
      <div
        ref={contentRef}
        className="utility-dialog-content notification-history-modal-body"
      >
        <NotificationHistoryPanel
          events={events}
          loading={loading}
          error={error}
        />
      </div>
    </BlueprintDialog>
  );
}
