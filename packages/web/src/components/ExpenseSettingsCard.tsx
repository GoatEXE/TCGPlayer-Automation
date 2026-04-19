import { useEffect, useState } from 'react';
import type {
  ExpenseSettings,
  UpdateExpenseSettingsRequest,
} from '../api/types';

interface ExpenseSettingsCardProps {
  settings: ExpenseSettings;
  onSave: (data: UpdateExpenseSettingsRequest) => Promise<void>;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2);
}

function parseDollarsToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function parsePercentToBps(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

export function ExpenseSettingsCard({ settings, onSave }: ExpenseSettingsCardProps) {
  const [autoRecordSaleExpenses, setAutoRecordSaleExpenses] = useState(
    settings.autoRecordSaleExpenses,
  );
  const [autoRecordShipping, setAutoRecordShipping] = useState(
    settings.autoRecordShipping,
  );
  const [shippingCost, setShippingCost] = useState(
    centsToDollars(settings.shippingCostCents),
  );
  const [autoRecordSupplies, setAutoRecordSupplies] = useState(
    settings.autoRecordSupplies,
  );
  const [suppliesCost, setSuppliesCost] = useState(
    centsToDollars(settings.suppliesCostCents),
  );
  const [autoRecordTcgplayerFees, setAutoRecordTcgplayerFees] = useState(
    settings.autoRecordTcgplayerFees,
  );
  const [marketplaceFee, setMarketplaceFee] = useState(
    bpsToPercent(settings.marketplaceFeeBps),
  );
  const [transactionFee, setTransactionFee] = useState(
    bpsToPercent(settings.transactionFeeBps),
  );
  const [transactionFlatFee, setTransactionFlatFee] = useState(
    centsToDollars(settings.transactionFlatFeeCents),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAutoRecordSaleExpenses(settings.autoRecordSaleExpenses);
    setAutoRecordShipping(settings.autoRecordShipping);
    setShippingCost(centsToDollars(settings.shippingCostCents));
    setAutoRecordSupplies(settings.autoRecordSupplies);
    setSuppliesCost(centsToDollars(settings.suppliesCostCents));
    setAutoRecordTcgplayerFees(settings.autoRecordTcgplayerFees);
    setMarketplaceFee(bpsToPercent(settings.marketplaceFeeBps));
    setTransactionFee(bpsToPercent(settings.transactionFeeBps));
    setTransactionFlatFee(centsToDollars(settings.transactionFlatFeeCents));
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const shippingCostCents = parseDollarsToCents(shippingCost);
    const suppliesCostCents = parseDollarsToCents(suppliesCost);
    const transactionFlatFeeCents = parseDollarsToCents(transactionFlatFee);
    const marketplaceFeeBps = parsePercentToBps(marketplaceFee);
    const transactionFeeBps = parsePercentToBps(transactionFee);

    if (
      shippingCostCents === null ||
      suppliesCostCents === null ||
      transactionFlatFeeCents === null
    ) {
      setError('Cost fields must be valid non-negative dollar amounts');
      return;
    }

    if (marketplaceFeeBps === null || transactionFeeBps === null) {
      setError('Fee fields must be valid non-negative percentages');
      return;
    }

    setSaving(true);

    try {
      await onSave({
        autoRecordSaleExpenses,
        autoRecordShipping,
        shippingCostCents,
        autoRecordSupplies,
        suppliesCostCents,
        autoRecordTcgplayerFees,
        marketplaceFeeBps,
        transactionFeeBps,
        transactionFlatFeeCents,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="price-check-card expense-settings-card">
      <div className="price-check-header">
        <span className="price-check-title">⚙️ Expense Settings</span>
      </div>

      <form onSubmit={handleSubmit} className="price-check-body" noValidate>
        <div className="shipment-field">
          <label htmlFor="settings-auto-record-sale-expenses">
            <input
              id="settings-auto-record-sale-expenses"
              type="checkbox"
              checked={autoRecordSaleExpenses}
              onChange={(e) => setAutoRecordSaleExpenses(e.target.checked)}
              disabled={saving}
            />{' '}
            Auto-record sale expenses
          </label>
        </div>

        <div className="shipment-field">
          <label htmlFor="settings-auto-record-shipping">
            <input
              id="settings-auto-record-shipping"
              type="checkbox"
              checked={autoRecordShipping}
              onChange={(e) => setAutoRecordShipping(e.target.checked)}
              disabled={saving}
            />{' '}
            Auto-record shipping
          </label>
          <label htmlFor="settings-auto-record-supplies">
            <input
              id="settings-auto-record-supplies"
              type="checkbox"
              checked={autoRecordSupplies}
              onChange={(e) => setAutoRecordSupplies(e.target.checked)}
              disabled={saving}
            />{' '}
            Auto-record supplies
          </label>
          <label htmlFor="settings-auto-record-fees">
            <input
              id="settings-auto-record-fees"
              type="checkbox"
              checked={autoRecordTcgplayerFees}
              onChange={(e) => setAutoRecordTcgplayerFees(e.target.checked)}
              disabled={saving}
            />{' '}
            Auto-record TCGplayer fees
          </label>
        </div>

        <div className="shipment-field">
          <label htmlFor="settings-shipping-cost">Default shipping cost ($)</label>
          <input
            id="settings-shipping-cost"
            type="number"
            min={0}
            step={0.01}
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
            disabled={saving}
            className="shipment-input"
          />
        </div>

        <div className="shipment-field">
          <label htmlFor="settings-supplies-cost">Default supplies cost ($)</label>
          <input
            id="settings-supplies-cost"
            type="number"
            min={0}
            step={0.01}
            value={suppliesCost}
            onChange={(e) => setSuppliesCost(e.target.value)}
            disabled={saving}
            className="shipment-input"
          />
        </div>

        <div className="shipment-field">
          <label htmlFor="settings-marketplace-fee">Marketplace fee (%)</label>
          <input
            id="settings-marketplace-fee"
            type="number"
            min={0}
            step={0.01}
            value={marketplaceFee}
            onChange={(e) => setMarketplaceFee(e.target.value)}
            disabled={saving}
            className="shipment-input"
          />
        </div>

        <div className="shipment-field">
          <label htmlFor="settings-transaction-fee">Transaction fee (%)</label>
          <input
            id="settings-transaction-fee"
            type="number"
            min={0}
            step={0.01}
            value={transactionFee}
            onChange={(e) => setTransactionFee(e.target.value)}
            disabled={saving}
            className="shipment-input"
          />
        </div>

        <div className="shipment-field">
          <label htmlFor="settings-transaction-flat-fee">
            Transaction flat fee ($)
          </label>
          <input
            id="settings-transaction-flat-fee"
            type="number"
            min={0}
            step={0.01}
            value={transactionFlatFee}
            onChange={(e) => setTransactionFlatFee(e.target.value)}
            disabled={saving}
            className="shipment-input"
          />
        </div>

        {error && (
          <span className="interval-error" role="alert">
            {error}
          </span>
        )}

        <div className="modal-actions" style={{ padding: '0.75rem 0 0' }}>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? '⏳ Saving…' : '💾 Save Settings'}
          </button>
        </div>
      </form>
    </section>
  );
}
