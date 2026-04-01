import { useState, useEffect } from 'react';

interface IntervalSettingsControlProps {
  currentIntervalHours: number;
  onSaved: (intervalHours: number) => Promise<void>;
}

export function IntervalSettingsControl({
  currentIntervalHours,
  onSaved,
}: IntervalSettingsControlProps) {
  const [value, setValue] = useState(currentIntervalHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when prop changes (e.g. after a successful save refreshes parent state)
  useEffect(() => {
    setValue(currentIntervalHours);
  }, [currentIntervalHours]);

  const validate = (v: number): string | null => {
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      return 'Must be a whole number';
    }
    if (v < 1 || v > 168) {
      return 'Must be between 1 and 168';
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

  const unchanged = value === currentIntervalHours;

  return (
    <form
      className="interval-settings-control"
      onSubmit={handleSubmit}
      aria-label="Price check interval settings"
    >
      <div className="interval-field">
        <label htmlFor="interval-hours" className="interval-label">
          Interval (hours)
        </label>
        <input
          id="interval-hours"
          type="number"
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
            setError(null);
          }}
          disabled={saving}
          className="interval-input"
          aria-invalid={!!error}
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
