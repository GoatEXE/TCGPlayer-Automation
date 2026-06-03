import { useEffect, useState } from 'react';

interface ListedPriceThresholdControlProps {
  currentThresholdPercent: number;
  onSaved: (thresholdPercent: number) => Promise<void>;
}

export function ListedPriceThresholdControl({
  currentThresholdPercent,
  onSaved,
}: ListedPriceThresholdControlProps) {
  const [value, setValue] = useState(currentThresholdPercent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentThresholdPercent);
  }, [currentThresholdPercent]);

  const validate = (v: number): string | null => {
    if (!Number.isFinite(v)) {
      return 'Must be a number';
    }
    if (v < 0) {
      return 'Must be a non-negative number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await onSaved(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const unchanged = value === currentThresholdPercent;

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
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
            setError(null);
          }}
          disabled={saving}
          className="interval-input"
          aria-invalid={!!error}
          step="0.1"
        />
        <button
          type="submit"
          disabled={saving || unchanged}
          className="button-primary interval-save-button"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="price-check-help">
        Marks already-listed cards Needs Attention when persisted Listing differs
        from current Rec&apos;d by at least this percent. This does not change
        TCGPlayer listing prices.
      </p>
      {error && (
        <span className="interval-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
