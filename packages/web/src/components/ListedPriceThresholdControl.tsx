import { useEffect, useState } from 'react';

interface ListedPriceThresholdControlProps {
  currentThresholdPercent: number;
  currentMinDiffCents: number;
  onSaved: (thresholdPercent: number, minDiffCents: number) => Promise<void>;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

export function ListedPriceThresholdControl({
  currentThresholdPercent,
  currentMinDiffCents,
  onSaved,
}: ListedPriceThresholdControlProps) {
  const [thresholdValue, setThresholdValue] = useState(currentThresholdPercent);
  const [minDiffValue, setMinDiffValue] = useState(
    centsToDollars(currentMinDiffCents),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setThresholdValue(currentThresholdPercent);
  }, [currentThresholdPercent]);

  useEffect(() => {
    setMinDiffValue(centsToDollars(currentMinDiffCents));
  }, [currentMinDiffCents]);

  const validateThreshold = (v: number): string | null => {
    if (!Number.isFinite(v)) {
      return 'Percent threshold must be a number';
    }
    if (v < 0) {
      return 'Percent threshold must be a non-negative number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateThreshold(thresholdValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    const minDiffCents = parseDollarsToCents(minDiffValue);
    if (minDiffCents === null) {
      setError('Minimum dollar difference must be a valid non-negative dollar amount');
      return;
    }

    setSaving(true);
    try {
      await onSaved(thresholdValue, minDiffCents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const unchanged =
    thresholdValue === currentThresholdPercent &&
    parseDollarsToCents(minDiffValue) === currentMinDiffCents;

  return (
    <form
      className="interval-settings-control"
      onSubmit={handleSubmit}
      aria-label="Listed price attention threshold settings"
    >
      <div className="interval-field">
        <label htmlFor="listed-price-attention-threshold" className="interval-label">
          Listing attention threshold (%)
        </label>
        <input
          id="listed-price-attention-threshold"
          type="number"
          value={thresholdValue}
          onChange={(e) => {
            setThresholdValue(Number(e.target.value));
            setError(null);
          }}
          disabled={saving}
          className="interval-input"
          aria-invalid={!!error}
          step="0.1"
        />
      </div>

      <div className="interval-field">
        <label htmlFor="listed-price-attention-min-diff" className="interval-label">
          Minimum dollar difference ($)
        </label>
        <input
          id="listed-price-attention-min-diff"
          type="number"
          value={minDiffValue}
          onChange={(e) => {
            setMinDiffValue(e.target.value);
            setError(null);
          }}
          disabled={saving}
          className="interval-input"
          aria-invalid={!!error}
          step="0.01"
        />
        <button
          type="submit"
          disabled={saving || unchanged}
          className="button-primary interval-save-button"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <span className="interval-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
