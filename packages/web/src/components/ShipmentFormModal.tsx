import { useState } from 'react';
import type {
  Shipment,
  CreateShipmentRequest,
  UpdateShipmentRequest,
} from '../api/types';

export type ShipmentSubmitPayload =
  | { mode: 'create'; saleId: number; data: CreateShipmentRequest }
  | { mode: 'update'; shipmentId: number; data: UpdateShipmentRequest };

interface ShipmentFormModalProps {
  saleId: number;
  shipment: Shipment | null;
  onSubmit: (payload: ShipmentSubmitPayload) => Promise<void>;
  onClose: () => void;
}

const carrierOptions = ['', 'USPS', 'UPS', 'FedEx', 'PWE', 'Other'];

export function ShipmentFormModal({
  saleId,
  shipment,
  onSubmit,
  onClose,
}: ShipmentFormModalProps) {
  const [carrier, setCarrier] = useState(shipment?.carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(
    shipment?.trackingNumber ?? '',
  );
  const [notes, setNotes] = useState(shipment?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = shipment !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (isEdit) {
        await onSubmit({
          mode: 'update',
          shipmentId: shipment.id,
          data: {
            carrier: carrier || null,
            trackingNumber: trackingNumber || null,
            notes: notes || null,
          },
        });
      } else {
        await onSubmit({
          mode: 'create',
          saleId,
          data: {
            carrier: carrier || null,
            trackingNumber: trackingNumber || null,
            notes: notes || null,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !saving) {
      onClose();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit shipment' : 'Record shipment'}
      tabIndex={-1}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isEdit ? '✏️ Edit Shipment' : '📦 Record Shipment'}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="shipment-form">
          <div className="shipment-field">
            <label htmlFor="shipment-carrier">Carrier</label>
            <select
              id="shipment-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              disabled={saving}
              className="shipment-select"
            >
              {carrierOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt || '— Select —'}
                </option>
              ))}
            </select>
          </div>

          <div className="shipment-field">
            <label htmlFor="shipment-tracking">Tracking Number</label>
            <input
              id="shipment-tracking"
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              disabled={saving}
              className="shipment-input"
              placeholder="Optional"
            />
          </div>

          <div className="shipment-field">
            <label htmlFor="shipment-notes">Notes</label>
            <textarea
              id="shipment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              className="shipment-textarea"
              rows={2}
              placeholder="Optional"
            />
          </div>

          {error && (
            <span className="interval-error" role="alert">
              {error}
            </span>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? '⏳ Saving…' : '💾 Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
