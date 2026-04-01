import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewTabs } from '../ViewTabs';
import type { ViewMode } from '../ViewTabs';

describe('ViewTabs', () => {
  const onChangeView = vi.fn();

  it('renders Inventory, Active Listings, and Sales History tabs', () => {
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    expect(screen.getByRole('tab', { name: /inventory/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /active listings/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /sales history/i })).toBeTruthy();
  });

  it('marks Inventory tab as selected when activeView is inventory', () => {
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    const tab = screen.getByRole('tab', { name: /inventory/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');

    const listingsTab = screen.getByRole('tab', { name: /active listings/i });
    expect(listingsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('marks Active Listings tab as selected when activeView is active-listings', () => {
    render(
      <ViewTabs activeView="active-listings" onChangeView={onChangeView} />,
    );

    const tab = screen.getByRole('tab', { name: /active listings/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onChangeView with active-listings when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    await user.click(screen.getByRole('tab', { name: /active listings/i }));
    expect(onChangeView).toHaveBeenCalledWith('active-listings');
  });

  it('calls onChangeView with inventory when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ViewTabs activeView="active-listings" onChangeView={onChangeView} />,
    );

    await user.click(screen.getByRole('tab', { name: /inventory/i }));
    expect(onChangeView).toHaveBeenCalledWith('inventory');
  });

  it('marks Sales History tab as selected when activeView is sales-history', () => {
    render(<ViewTabs activeView="sales-history" onChangeView={onChangeView} />);

    const tab = screen.getByRole('tab', { name: /sales history/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');

    const inventoryTab = screen.getByRole('tab', { name: /inventory/i });
    expect(inventoryTab.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChangeView with sales-history when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    await user.click(screen.getByRole('tab', { name: /sales history/i }));
    expect(onChangeView).toHaveBeenCalledWith('sales-history');
  });
});
