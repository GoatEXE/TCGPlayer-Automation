import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewTabs } from '../ViewTabs';

describe('ViewTabs', () => {
  const onChangeView = vi.fn();

  it('renders Inventory, Collection, Sales History, and Performance tabs without Notifications', () => {
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    expect(screen.getByRole('tab', { name: /inventory/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /collection/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /sales history/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /performance/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /notifications/i })).toBeNull();
    expect(
      screen.queryByRole('tab', { name: /scan \/ add cards/i }),
    ).toBeNull();
  });

  it('marks Inventory tab as selected when activeView is inventory', () => {
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    const tab = screen.getByRole('tab', { name: /inventory/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');

    const performanceTab = screen.getByRole('tab', { name: /performance/i });
    expect(performanceTab.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChangeView with inventory when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ViewTabs activeView="collection" onChangeView={onChangeView} />);

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

  it('marks Performance tab as selected when activeView is performance', () => {
    render(<ViewTabs activeView="performance" onChangeView={onChangeView} />);

    const tab = screen.getByRole('tab', { name: /performance/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');

    const inventoryTab = screen.getByRole('tab', { name: /inventory/i });
    expect(inventoryTab.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChangeView with performance when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));
    expect(onChangeView).toHaveBeenCalledWith('performance');
  });
});
