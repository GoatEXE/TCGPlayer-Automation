import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalesTable } from '../SalesTable';
import type { Sale } from '../../api/types';

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    cardId: 10,
    tcgplayerOrderId: 'ORD-123',
    quantitySold: 2,
    salePriceCents: 499,
    buyerName: 'Jane Doe',
    orderStatus: 'confirmed',
    soldAt: '2026-03-30T14:00:00.000Z',
    notes: null,
    createdAt: '2026-03-30T14:00:00.000Z',
    updatedAt: '2026-03-30T14:00:00.000Z',
    cardProductName: "Targon's Peak",
    cardSetName: 'Origins',
    ...overrides,
  };
}

describe('SalesTable', () => {
  it('renders column headers', () => {
    render(<SalesTable sales={[]} loading={false} />);

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.getByText('Set')).toBeTruthy();
    expect(screen.getByText('Qty')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.getByText('Buyer')).toBeTruthy();
    expect(screen.getByText('Order ID')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
  });

  it('renders loading state', () => {
    render(<SalesTable sales={[]} loading={true} />);
    expect(screen.getByText('Loading sales…')).toBeTruthy();
  });

  it('renders empty state when no sales', () => {
    render(<SalesTable sales={[]} loading={false} />);
    expect(screen.getByText('No sales recorded yet.')).toBeTruthy();
  });

  it('renders sale rows with formatted data', () => {
    const sale = makeSale();
    render(<SalesTable sales={[sale]} loading={false} />);

    expect(screen.getByText("Targon's Peak")).toBeTruthy();
    expect(screen.getByText('Origins')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('ORD-123')).toBeTruthy();
    expect(screen.getByText('confirmed')).toBeTruthy();
  });

  it('shows dash for missing buyer name', () => {
    render(
      <SalesTable sales={[makeSale({ buyerName: null })]} loading={false} />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    // Columns: date, card, set, qty, price, buyer, orderId, status
    expect(cells[5].textContent).toBe('—');
  });

  it('shows dash for missing order id', () => {
    render(
      <SalesTable
        sales={[makeSale({ tcgplayerOrderId: null })]}
        loading={false}
      />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    expect(cells[6].textContent).toBe('—');
  });

  it('shows dash for missing card name', () => {
    render(
      <SalesTable
        sales={[makeSale({ cardProductName: null })]}
        loading={false}
      />,
    );
    const rows = screen.getAllByRole('row');
    const cells = rows[1].querySelectorAll('td');
    expect(cells[1].textContent).toBe('—');
  });
});
