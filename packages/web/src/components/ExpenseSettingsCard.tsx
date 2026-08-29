import { Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  ExpenseSettings,
  UpdateExpenseSettingsRequest,
} from '../api/types';
import { BlueprintButton, BlueprintPanel } from '../ui';

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
  const [defaultShippingCollected, setDefaultShippingCollected] = useState(
    centsToDollars(settings.defaultShippingCollectedCents ?? 149),
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
    setDefaultShippingCollected(
      centsToDollars(settings.defaultShippingCollectedCents ?? 149),
    );
    setAutoRecordSupplies(settings.autoRecordSupplies);
    setSuppliesCost(centsToDollars(settings.suppliesCostCents));
    setAutoRecordTcgplayerFees(settings.autoRecordTcgplayerFees);
    setMarketplaceFee(bpsToPercent(settings.marketplaceFeeBps));
    setTransactionFee(bpsToPercent(settings.transactionFeeBps));
    setTransactionFlatFee(centsToDollars(settings.transactionFlatFeeCents));
  }, [settings]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const shippingCostCents = parseDollarsToCents(shippingCost);
    const defaultShippingCollectedCents = parseDollarsToCents(
      defaultShippingCollected,
    );
    const suppliesCostCents = parseDollarsToCents(suppliesCost);
    const transactionFlatFeeCents = parseDollarsToCents(transactionFlatFee);
    const marketplaceFeeBps = parsePercentToBps(marketplaceFee);
    const transactionFeeBps = parsePercentToBps(transactionFee);

    if (
      shippingCostCents === null ||
      defaultShippingCollectedCents === null ||
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
        defaultShippingCollectedCents,
        autoRecordSupplies,
        suppliesCostCents,
        autoRecordTcgplayerFees,
        marketplaceFeeBps,
        transactionFeeBps,
        transactionFlatFeeCents,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Failed to save settings',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BlueprintPanel className="expense-settings-card commerce-expense-settings">
      <header className="commerce-expense-settings-header">
        <SlidersHorizontal size={20} strokeWidth={1.6} aria-hidden="true" />
        <h3>Expense Settings</h3>
      </header>

      <form
        onSubmit={handleSubmit}
        className="commerce-expense-settings-form"
        noValidate
      >
        <fieldset className="commerce-expense-settings-switches">
          <legend>Automatic expense entries</legend>
          <label
            className="commerce-checkbox-field"
            htmlFor="settings-auto-record-shipping"
          >
            <input
              id="settings-auto-record-shipping"
              type="checkbox"
              checked={autoRecordShipping}
              onChange={(event) => setAutoRecordShipping(event.target.checked)}
              disabled={saving}
            />
            Auto-record shipping
          </label>
          <label
            className="commerce-checkbox-field"
            htmlFor="settings-auto-record-supplies"
          >
            <input
              id="settings-auto-record-supplies"
              type="checkbox"
              checked={autoRecordSupplies}
              onChange={(event) => setAutoRecordSupplies(event.target.checked)}
              disabled={saving}
            />
            Auto-record supplies
          </label>
          <label
            className="commerce-checkbox-field"
            htmlFor="settings-auto-record-fees"
          >
            <input
              id="settings-auto-record-fees"
              type="checkbox"
              checked={autoRecordTcgplayerFees}
              onChange={(event) =>
                setAutoRecordTcgplayerFees(event.target.checked)
              }
              disabled={saving}
            />
            Auto-record TCGplayer fees
          </label>
        </fieldset>

        <div className="commerce-expense-settings-field">
          <label htmlFor="settings-shipping-cost">
            Default postage cost expense ($)
          </label>
          <input
            id="settings-shipping-cost"
            type="number"
            min={0}
            step={0.01}
            value={shippingCost}
            onChange={(event) => setShippingCost(event.target.value)}
            disabled={saving}
            inputMode="decimal"
          />
        </div>

        <div className="commerce-expense-settings-field">
          <label htmlFor="settings-shipping-collected">
            Default shipping collected ($)
          </label>
          <input
            id="settings-shipping-collected"
            type="number"
            min={0}
            step={0.01}
            value={defaultShippingCollected}
            onChange={(event) => setDefaultShippingCollected(event.target.value)}
            disabled={saving}
            inputMode="decimal"
          />
        </div>

        <div className="commerce-expense-settings-field">
          <label htmlFor="settings-supplies-cost">
            Default supplies cost ($)
          </label>
          <input
            id="settings-supplies-cost"
            type="number"
            min={0}
            step={0.01}
            value={suppliesCost}
            onChange={(event) => setSuppliesCost(event.target.value)}
            disabled={saving}
            inputMode="decimal"
          />
        </div>

        <div className="commerce-expense-settings-field">
          <label htmlFor="settings-marketplace-fee">Marketplace fee (%)</label>
          <input
            id="settings-marketplace-fee"
            type="number"
            min={0}
            step={0.01}
            value={marketplaceFee}
            onChange={(event) => setMarketplaceFee(event.target.value)}
            disabled={saving}
            inputMode="decimal"
          />
        </div>

        <div className="commerce-expense-settings-field">
          <label htmlFor="settings-transaction-fee">Transaction fee (%)</label>
          <input
            id="settings-transaction-fee"
            type="number"
            min={0}
            step={0.01}
            value={transactionFee}
            onChange={(event) => setTransactionFee(event.target.value)}
            disabled={saving}
            inputMode="decimal"
          />
        </div>

        <div className="commerce-expense-settings-field">
          <label htmlFor="settings-transaction-flat-fee">
            Transaction flat fee ($)
          </label>
          <input
            id="settings-transaction-flat-fee"
            type="number"
            min={0}
            step={0.01}
            value={transactionFlatFee}
            onChange={(event) => setTransactionFlatFee(event.target.value)}
            disabled={saving}
            inputMode="decimal"
          />
        </div>

        {error && (
          <span className="interval-error" role="alert">
            {error}
          </span>
        )}

        <div className="commerce-expense-settings-actions">
          <BlueprintButton
            type="submit"
            variant="primary"
            disabled={saving}
            icon={<Save size={16} strokeWidth={1.75} />}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </BlueprintButton>
        </div>
      </form>
    </BlueprintPanel>
  );
}
