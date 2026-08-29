import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
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

  it('uses icons and moves through the view tabs with keyboard arrows', async () => {
    const user = userEvent.setup();
    onChangeView.mockClear();
    render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);

    const inventory = screen.getByRole('tab', { name: /inventory/i });
    expect(inventory.querySelector('svg')).toBeTruthy();
    inventory.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /collection/i })).toHaveFocus();
    expect(onChangeView).toHaveBeenCalledWith('collection');
  });

  it('uses the container-responsive phone mode below 760px while tablet and desktop remain inline', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
      writable: true,
    });

    try {
      render(<ViewTabs activeView="inventory" onChangeView={onChangeView} />);
      const tabList = screen.getByRole('tablist');
      expect(tabList).toHaveAttribute('data-layout', 'desktop');

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 760,
        writable: true,
      });
      window.dispatchEvent(new Event('resize'));
      await waitFor(() => {
        expect(tabList).toHaveAttribute('data-layout', 'desktop');
      });

      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 375,
        writable: true,
      });
      window.dispatchEvent(new Event('resize'));
      await waitFor(() => {
        expect(tabList).toHaveAttribute('data-layout', 'phone');
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalWidth,
        writable: true,
      });
      window.dispatchEvent(new Event('resize'));
    }
  });
});
