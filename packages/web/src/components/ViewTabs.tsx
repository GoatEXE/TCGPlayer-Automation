export type ViewMode = 'inventory' | 'active-listings' | 'sales-history';

interface ViewTabsProps {
  activeView: ViewMode;
  onChangeView: (view: ViewMode) => void;
}

const tabs: { value: ViewMode; label: string }[] = [
  { value: 'inventory', label: '📦 Inventory' },
  { value: 'active-listings', label: '🏷️ Active Listings' },
  { value: 'sales-history', label: '💰 Sales History' },
];

export function ViewTabs({ activeView, onChangeView }: ViewTabsProps) {
  return (
    <nav className="view-tabs" role="tablist" aria-label="Dashboard views">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={activeView === tab.value}
          className={`view-tab ${activeView === tab.value ? 'view-tab-active' : ''}`}
          onClick={() => onChangeView(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
