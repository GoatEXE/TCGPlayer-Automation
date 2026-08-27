import { useRef } from 'react';
import type { NotificationEvent } from '../api/types';
import { NotificationHistoryPanel } from './NotificationHistoryPanel';
import { useModalFocusTrap } from './useModalFocusTrap';

interface NotificationHistoryModalProps {
  events: NotificationEvent[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
}

export function NotificationHistoryModal({
  events,
  loading,
  error,
  onClose,
}: NotificationHistoryModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalFocusTrap({
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
  });

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-history-modal-title"
    >
      <div className="modal-content notification-history-modal" ref={dialogRef}>
        <div className="modal-header">
          <h2 id="notification-history-modal-title">Notifications</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close notifications"
          >
            ✕
          </button>
        </div>

        <div className="notification-history-modal-body">
          <NotificationHistoryPanel
            events={events}
            loading={loading}
            error={error}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
