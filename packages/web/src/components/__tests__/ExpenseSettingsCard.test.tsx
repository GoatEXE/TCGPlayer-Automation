import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseSettingsCard } from '../ExpenseSettingsCard';
import type {
  ExpenseSettings,
  UpdateExpenseSettingsRequest,
} from '../../api/types';

const mockSettings: ExpenseSettings = {
  id: 1,
  autoRecordSaleExpenses: false,
  autoRecordShipping: true,
  shippingCostCents: 99,
  defaultShippingCollectedCents: 149,
  autoRecordSupplies: true,
  suppliesCostCents: 25,
  autoRecordTcgplayerFees: true,
  marketplaceFeeBps: 1075,
  transactionFeeBps: 250,
  transactionFlatFeeCents: 30,
  createdAt: '2026-04-18T10:00:00.000Z',
  updatedAt: '2026-04-18T10:00:00.000Z',
};

describe('ExpenseSettingsCard', () => {
  const onSave = vi.fn<(data: UpdateExpenseSettingsRequest) => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders toggles and defaults with dollar/percent conversions', () => {
    render(<ExpenseSettingsCard settings={mockSettings} onSave={onSave} />);

    const autoShipping = screen.getByLabelText(/Auto-record shipping/i) as HTMLInputElement;
    const autoSupplies = screen.getByLabelText(/Auto-record supplies/i) as HTMLInputElement;
    const autoFees = screen.getByLabelText(/Auto-record TCGplayer fees/i) as HTMLInputElement;

    expect(screen.queryByLabelText(/Auto-record sale expenses/i)).toBeNull();
    expect(autoShipping.checked).toBe(true);
    expect(autoSupplies.checked).toBe(true);
    expect(autoFees.checked).toBe(true);

    const shippingInput = screen.getByLabelText(
      /Default postage cost expense \(\$\)/i,
    ) as HTMLInputElement;
    const shippingCollectedInput = screen.getByLabelText(
      /Default shipping collected \(\$\)/i,
    ) as HTMLInputElement;
    const suppliesInput = screen.getByLabelText(
      /Default supplies cost \(\$\)/i,
    ) as HTMLInputElement;
    const marketplaceInput = screen.getByLabelText(
      /Marketplace fee \(%\)/i,
    ) as HTMLInputElement;
    const transactionFeeInput = screen.getByLabelText(
      /Transaction fee \(%\)/i,
    ) as HTMLInputElement;
    const transactionFlatInput = screen.getByLabelText(
      /Transaction flat fee \(\$\)/i,
    ) as HTMLInputElement;

    expect(shippingInput.value).toBe('0.99');
    expect(shippingCollectedInput.value).toBe('1.49');
    expect(suppliesInput.value).toBe('0.25');
    expect(parseFloat(marketplaceInput.value)).toBe(10.75);
    expect(parseFloat(transactionFeeInput.value)).toBe(2.5);
    expect(transactionFlatInput.value).toBe('0.30');
  });

  it('submits converted cents and basis points on save', async () => {
    const user = userEvent.setup();
    onSave.mockResolvedValueOnce(undefined);

    render(<ExpenseSettingsCard settings={mockSettings} onSave={onSave} />);

    await user.click(screen.getByLabelText(/Auto-record supplies/i)); // true -> false

    const shippingInput = screen.getByLabelText(/Default postage cost expense/i);
    await user.clear(shippingInput);
    await user.type(shippingInput, '0.99');

    const shippingCollectedInput = screen.getByLabelText(/Default shipping collected/i);
    await user.clear(shippingCollectedInput);
    await user.type(shippingCollectedInput, '2.49');

    const suppliesInput = screen.getByLabelText(/Default supplies cost/i);
    await user.clear(suppliesInput);
    await user.type(suppliesInput, '0.35');

    const marketplaceInput = screen.getByLabelText(/Marketplace fee/i);
    await user.clear(marketplaceInput);
    await user.type(marketplaceInput, '9.5');

    const transactionFeeInput = screen.getByLabelText(/Transaction fee/i);
    await user.clear(transactionFeeInput);
    await user.type(transactionFeeInput, '2.75');

    const transactionFlatInput = screen.getByLabelText(/Transaction flat fee/i);
    await user.clear(transactionFlatInput);
    await user.type(transactionFlatInput, '0.33');

    await user.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        autoRecordSaleExpenses: false,
        autoRecordShipping: true,
        shippingCostCents: 99,
        defaultShippingCollectedCents: 249,
        autoRecordSupplies: false,
        suppliesCostCents: 35,
        autoRecordTcgplayerFees: true,
        marketplaceFeeBps: 950,
        transactionFeeBps: 275,
        transactionFlatFeeCents: 33,
      });
    });
  });

  it('shows error when save fails', async () => {
    const user = userEvent.setup();
    onSave.mockRejectedValueOnce(new Error('Failed to save settings'));

    render(<ExpenseSettingsCard settings={mockSettings} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Failed to save settings',
      );
    });
  });
});
