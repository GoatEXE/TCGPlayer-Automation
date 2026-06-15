import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewTabs } from '../ViewTabs';
import type { ViewMode } from '../ViewTabs';

describe('ViewTabs', () => {
  const onChangeView = vi.fn();

  it('renders Inventory, Notifications, Sales History, and Performance tabs', () => {
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    expect(screen.getByRole('tab', { name: /inventory/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /notifications/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /sales history/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /performance/i })).toBeTruthy();
  });

  it('marks Inventory tab as selected when activeView is inventory', () => {
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    const tab = screen.getByRole('tab', { name: /inventory/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');

    const notificationsTab = screen.getByRole('tab', { name: /notifications/i });
    expect(notificationsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('marks Notifications tab as selected when activeView is notifications', () => {
    render(
      <ViewTabs activeView="notifications" onChangeView={onChangeView} />,
    );

    const tab = screen.getByRole('tab', { name: /notifications/i });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onChangeView with notifications when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    await user.click(screen.getByRole('tab', { name: /notifications/i }));
    expect(onChangeView).toHaveBeenCalledWith('notifications');
  });

  it('calls onChangeView with inventory when that tab is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ViewTabs activeView="notifications" onChangeView={onChangeView} />,
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

  it('marks Performance tab as selected when activeView is performance', () => {
    render(<ViewTabs activeView={'performance' as ViewMode} onChangeView={onChangeView} />);

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
