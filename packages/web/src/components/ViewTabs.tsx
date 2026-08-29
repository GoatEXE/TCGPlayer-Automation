import {
  ChartNoAxesCombined,
  Library,
  Package,
  ReceiptText,
} from 'lucide-react';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useContainerResponsiveMode } from '../hooks/useContainerResponsiveMode';

export type ViewMode =
  | 'inventory'
  | 'collection'
  | 'sales-history'
  | 'performance';

interface ViewTabsProps {
  activeView: ViewMode;
  onChangeView: (view: ViewMode) => void;
}

const tabs: {
  value: ViewMode;
  label: string;
  icon: ReactNode;
}[] = [
  {
    value: 'inventory',
    label: 'Inventory',
    icon: <Package aria-hidden="true" size={16} strokeWidth={1.5} />,
  },
  {
    value: 'collection',
    label: 'Collection',
    icon: <Library aria-hidden="true" size={16} strokeWidth={1.5} />,
  },
  {
    value: 'sales-history',
    label: 'Sales History',
    icon: <ReceiptText aria-hidden="true" size={16} strokeWidth={1.5} />,
  },
  {
    value: 'performance',
    label: 'Performance',
    icon: <ChartNoAxesCombined aria-hidden="true" size={16} strokeWidth={1.5} />,
  },
];

export function ViewTabs({ activeView, onChangeView }: ViewTabsProps) {
  const tabListRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const responsiveMode = useContainerResponsiveMode(tabListRef);

  const moveFocus = (nextIndex: number) => {
    const wrappedIndex = (nextIndex + tabs.length) % tabs.length;
    const nextTab = tabs[wrappedIndex];
    tabRefs.current[wrappedIndex]?.focus();
    onChangeView(nextTab.value);
  };

  return (
    <nav
      ref={tabListRef}
      className="view-tabs shell-view-tabs"
      role="tablist"
      aria-label="Dashboard views"
      aria-orientation="horizontal"
      data-layout={responsiveMode}
    >
      {tabs.map((tab, index) => (
        <button
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={activeView === tab.value}
          aria-controls="dashboard-panel"
          tabIndex={activeView === tab.value ? 0 : -1}
          className={`view-tab ${activeView === tab.value ? 'view-tab-active' : ''}`}
          onClick={() => onChangeView(tab.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              moveFocus(index + 1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              moveFocus(index - 1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              moveFocus(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              moveFocus(tabs.length - 1);
            }
          }}
        >
          <span className="view-tab-icon">{tab.icon}</span>
          <span className="view-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
