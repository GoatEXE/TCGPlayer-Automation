import {
  AlertTriangle,
  Bell,
  Box,
  ChevronRight,
  DollarSign,
  LoaderCircle,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api/client';
import type {
  Card,
  CardStats,
  CreateBulkOrderRequest,
  CreateExpenseRequest,
  CreateSaleRequest,
  Expense,
  ExpenseCategory,
  ExpenseSettings,
  ExpenseSource,
  NotificationEvent,
  OrderStatus,
  PerformanceSummaryResponse,
  PriceCheckStatus,
  SalesOrder,
  SalesStats,
  SalesPipelineEntry,
  UpdateExpenseRequest,
  UpdateExpenseSettingsRequest,
} from './api/types';
import { SalesTable } from './components/SalesTable';
import { StatsBar } from './components/StatsBar';
import { SalesStatsBar } from './components/SalesStatsBar';
import { SalesPipelineCard } from './components/SalesPipelineCard';
import { ShipmentFormModal } from './components/ShipmentFormModal';
import type { ShipmentSubmitPayload } from './components/ShipmentFormModal';
import { PriceCheckSettingsModal } from './components/PriceCheckSettingsModal';
import { NotificationHistoryModal } from './components/NotificationHistoryModal';
import { CardTable } from './components/CardTable';
import type {
  CardTableHandle,
  SortDirection,
  SortField,
} from './components/CardTable';
import { Pagination } from './components/Pagination';
import { PerformanceSummaryCard } from './components/PerformanceSummaryCard';
import { ExpenseSettingsCard } from './components/ExpenseSettingsCard';
import { ExpenseTable } from './components/ExpenseTable';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ViewTabs } from './components/ViewTabs';
import type { ViewMode } from './components/ViewTabs';
import { CollectionView } from './components/CollectionView';
import { useTheme } from './hooks/useTheme';
import './App.css';
import './styles/shell.css';

type StatusFilter = 'all' | Card['status'];

interface ExpenseFilters {
  category?: ExpenseCategory;
  source?: ExpenseSource;
  search: string;
  dateFrom: string;
  dateTo: string;
}

function formatRelativePriceCheckTime(dateString: string): string | null {
  const timestamp = new Date(dateString).getTime();
  if (!Number.isFinite(timestamp)) return null;

  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;

  return new Date(dateString).toLocaleDateString();
}

function getPriceCheckSubtitle(
  status: PriceCheckStatus | null,
  loading: boolean,
): string | null {
  if (loading) return 'Checking price status…';
  if (!status) return null;
  if (status.running) return 'Price check in progress';

  if (status.latestPriceCheckAt) {
    const relativeTime = formatRelativePriceCheckTime(status.latestPriceCheckAt);
    return relativeTime ? `Last checked ${relativeTime}` : 'Last checked';
  }

  return 'Never checked';
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState<CardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewMode>('inventory');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [cardSortField, setCardSortField] = useState<SortField>('updatedAt');
  const [cardSortDirection, setCardSortDirection] =
    useState<SortDirection>('desc');
  const [totalItems, setTotalItems] = useState(0);
  const [repricingAll, setRepricingAll] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceCheckStatus, setPriceCheckStatus] =
    useState<PriceCheckStatus | null>(null);
  const [priceCheckLoading, setPriceCheckLoading] = useState(true);
  const [priceCheckError, setPriceCheckError] = useState(false);
  const [isPriceCheckSettingsOpen, setIsPriceCheckSettingsOpen] =
    useState(false);
  const priceCheckSettingsTriggerRef = useRef<HTMLButtonElement>(null);
  const cardTableRef = useRef<CardTableHandle>(null);
  const wasPriceCheckSettingsOpenRef = useRef(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesTotalItems, setSalesTotalItems] = useState(0);
  const [salesPage, setSalesPage] = useState(1);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null);
  const [salesStatsLoading, setSalesStatsLoading] = useState(false);
  const [pipeline, setPipeline] = useState<SalesPipelineEntry[]>([]);
  const [salesStatusFilter, setSalesStatusFilter] = useState<
    OrderStatus | undefined
  >(undefined);
  const [shipModalOrder, setShipModalOrder] = useState<SalesOrder | null>(null);
  const [notificationEvents, setNotificationEvents] = useState<
    NotificationEvent[]
  >([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(false);
  const [isNotificationHistoryOpen, setIsNotificationHistoryOpen] =
    useState(false);
  const notificationHistoryTriggerRef = useRef<HTMLButtonElement>(null);
  const wasNotificationHistoryOpenRef = useRef(false);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensePage, setExpensePage] = useState(1);
  const [expenseLimit] = useState(50);
  const [expenseTotalItems, setExpenseTotalItems] = useState(0);
  const [performanceSummary, setPerformanceSummary] =
    useState<PerformanceSummaryResponse | null>(null);
  const [performanceSummaryLoading, setPerformanceSummaryLoading] =
    useState(false);
  const [expenseSettings, setExpenseSettings] =
    useState<ExpenseSettings | null>(null);
  const [expenseSettingsLoading, setExpenseSettingsLoading] = useState(false);
  const [expenseFilters, setExpenseFilters] = useState<ExpenseFilters>({
    category: undefined,
    source: undefined,
    search: '',
    dateFrom: '',
    dateTo: '',
  });
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedExpenseForEdit, setSelectedExpenseForEdit] =
    useState<Expense | null>(null);

  const itemsPerPage = 50;

  useEffect(() => {
    if (wasPriceCheckSettingsOpenRef.current && !isPriceCheckSettingsOpen) {
      priceCheckSettingsTriggerRef.current?.focus();
    }
    wasPriceCheckSettingsOpenRef.current = isPriceCheckSettingsOpen;
  }, [isPriceCheckSettingsOpen]);

  useEffect(() => {
    if (wasNotificationHistoryOpenRef.current && !isNotificationHistoryOpen) {
      notificationHistoryTriggerRef.current?.focus();
    }
    wasNotificationHistoryOpenRef.current = isNotificationHistoryOpen;
  }, [isNotificationHistoryOpen]);

  const shouldHideFromActiveInventory = (card: Card) =>
    card.status === 'sold' ||
    card.status === 'gifted' ||
    // The API schema excludes this retired legacy value, but keep the UI safe
    // if an unmigrated response still contains one.
    (card.status as string) === 'gift';

  const fetchCards = async () => {
    setLoading(true);
    try {
      const response = await api.getCards({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined,
        page: currentPage,
        limit: itemsPerPage,
        sortField: cardSortField ?? undefined,
        sortDirection: cardSortDirection,
      });
      const visibleCards = response.cards.filter(
        (card) =>
          card.quantity > 0 &&
          (statusFilter !== 'all' || !shouldHideFromActiveInventory(card)),
      );
      setCards(visibleCards);
      setTotalItems(response.total);
    } catch (err) {
      console.error('Failed to fetch cards:', err);
      alert(err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllNeedsAttentionCards = async () => {
    const limit = 200;
    const allCards: Card[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;

    while (allCards.length < total) {
      const response = await api.getCards({
        status: 'needs_attention',
        page,
        limit,
        sortField: 'productName',
        sortDirection: 'asc',
      });
      allCards.push(...response.cards);
      total = response.total;

      if (response.cards.length === 0) {
        break;
      }

      page += 1;
    }

    return allCards;
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const statsData = await api.getStats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchSalesStats = async () => {
    setSalesStatsLoading(true);
    try {
      const data = await api.getSalesStats();
      setSalesStats(data);
    } catch (err) {
      console.error('Failed to fetch sales stats:', err);
    } finally {
      setSalesStatsLoading(false);
    }
  };

  const fetchPipeline = async () => {
    try {
      const data = await api.getSalesPipeline();
      setPipeline(data.pipeline);
    } catch (err) {
      console.error('Failed to fetch pipeline:', err);
    }
  };

  const fetchSales = async () => {
    setSalesLoading(true);
    try {
      const response = await api.getSales({
        search: salesSearch || undefined,
        orderStatus: salesStatusFilter,
        page: salesPage,
        limit: itemsPerPage,
      });
      setOrders(response.orders);
      setSalesTotalItems(response.total);
    } catch (err) {
      console.error('Failed to fetch sales:', err);
      alert(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setSalesLoading(false);
    }
  };

  const fetchNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(false);
    try {
      const data = await api.getNotificationEvents(20);
      setNotificationEvents(data.events);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setNotificationsError(true);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const fetchExpenses = async () => {
    setExpensesLoading(true);
    try {
      const response = await api.getExpenses({
        page: expensePage,
        limit: expenseLimit,
        category: expenseFilters.category,
        source: expenseFilters.source,
        search: expenseFilters.search || undefined,
        dateFrom: expenseFilters.dateFrom || undefined,
        dateTo: expenseFilters.dateTo || undefined,
      });
      setExpenses(response.expenses);
      setExpenseTotalItems(response.total);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
      alert(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setExpensesLoading(false);
    }
  };

  const fetchPerformanceSummary = async () => {
    setPerformanceSummaryLoading(true);
    try {
      const summary = await api.getPerformanceSummary({
        dateFrom: expenseFilters.dateFrom || undefined,
        dateTo: expenseFilters.dateTo || undefined,
      });
      setPerformanceSummary(summary);
    } catch (err) {
      console.error('Failed to fetch performance summary:', err);
    } finally {
      setPerformanceSummaryLoading(false);
    }
  };

  const fetchExpenseSettings = async () => {
    setExpenseSettingsLoading(true);
    try {
      const settings = await api.getExpenseSettings();
      setExpenseSettings(settings);
    } catch (err) {
      console.error('Failed to fetch expense settings:', err);
    } finally {
      setExpenseSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'inventory') {
      fetchCards();
    }
  }, [
    activeView,
    statusFilter,
    searchQuery,
    currentPage,
    cardSortField,
    cardSortDirection,
  ]);

  useEffect(() => {
    if (activeView !== 'sales-history') return;
    fetchSales();
    fetchSalesStats();
    fetchPipeline();
  }, [activeView, salesPage, salesSearch, salesStatusFilter]);

  useEffect(() => {
    if (!isNotificationHistoryOpen) return;
    fetchNotifications();
  }, [fetchNotifications, isNotificationHistoryOpen]);

  useEffect(() => {
    if (activeView !== 'performance') return;
    fetchExpenses();
    fetchPerformanceSummary();
  }, [
    activeView,
    expensePage,
    expenseLimit,
    expenseFilters.category,
    expenseFilters.source,
    expenseFilters.search,
    expenseFilters.dateFrom,
    expenseFilters.dateTo,
  ]);

  useEffect(() => {
    if (activeView !== 'performance') return;
    fetchExpenseSettings();
  }, [activeView]);

  const fetchPriceCheckStatus = async () => {
    setPriceCheckLoading(true);
    setPriceCheckError(false);
    try {
      const data = await api.getPriceCheckStatus();
      setPriceCheckStatus(data);
    } catch (err) {
      console.error('Failed to fetch price check status:', err);
      setPriceCheckError(true);
    } finally {
      setPriceCheckLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchPriceCheckStatus();
    fetchExpenseSettings();
  }, []);

  const handleReprice = async (id: number) => {
    try {
      const updatedCard = await api.repriceCard(id);
      setCards(cards.map((c) => (c.id === id ? updatedCard : c)));
      fetchStats();
      fetchPriceCheckStatus();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reprice card');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteCard(id);
      setCards(cards.filter((c) => c.id !== id));
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete card');
    }
  };

  const handleRepriceAll = async () => {
    if (!confirm('Re-price all cards? This may take a while.')) return;

    setRepricingAll(true);
    try {
      const result = await api.repriceAll();
      alert(`✅ Re-priced ${result.updated} cards`);
      fetchCards();
      fetchStats();
      fetchPriceCheckStatus();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reprice all cards');
    } finally {
      setRepricingAll(false);
    }
  };

  const handleFetchPrices = async () => {
    if (
      !confirm(
        'Fetch latest prices from TCGTracking? This may take a few minutes.',
      )
    )
      return;

    setFetchingPrices(true);
    try {
      const result = await api.fetchPrices();
      const driftLine =
        result.drifted !== undefined
          ? `\n${result.drifted} cards exceeded drift threshold`
          : '';
      const message = `✅ Updated ${result.updated} cards\n${result.notFound} cards not found in TCGTracking${driftLine}`;
      if (result.errors.length > 0) {
        alert(`${message}\n\n⚠️ Errors:\n${result.errors.join('\n')}`);
      } else {
        alert(message);
      }
      fetchCards();
      fetchStats();
      fetchPriceCheckStatus();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setFetchingPrices(false);
    }
  };

  const handleMarkListed = async (cardIds: number[]) => {
    try {
      const result = await api.markListed(cardIds);
      let message = `✅ Marked ${result.updated} card${result.updated !== 1 ? 's' : ''} as listed`;
      if (result.errors.length > 0) {
        message += `\n\n⚠️ Skipped ${result.errors.length} card${result.errors.length !== 1 ? 's' : ''}:\n${result.errors.join('\n')}`;
      }
      alert(message);
      fetchCards();
      fetchStats();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Failed to mark cards as listed',
      );
    }
  };

  const handleUpdateInterval = async (intervalHours: number) => {
    const updated = await api.updatePriceCheckSettings({ intervalHours });
    setPriceCheckStatus(updated);
  };

  const handleUpdateListedPriceAttentionThreshold = async (
    listedPriceAttentionThresholdPercent: number,
    listedPriceAttentionMinDiffCents: number,
  ) => {
    const updated = await api.updatePriceCheckSettings({
      listedPriceAttentionThresholdPercent,
      listedPriceAttentionMinDiffCents,
    });
    setPriceCheckStatus(updated);
  };

  const handleUnlist = async (id: number) => {
    try {
      const updatedCard = await api.unlistCard(id);
      setCards(cards.map((c) => (c.id === id ? updatedCard : c)));
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unlist card');
    }
  };

  const handleUpdateCard = async (id: number, data: Partial<Card>) => {
    try {
      const updatedCard = await api.updateCard(id, data);
      setCards(cards.map((c) => (c.id === id ? updatedCard : c)));
      return updatedCard;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update card');
      throw err;
    }
  };

  const handleRecordSale = async (data: CreateSaleRequest) => {
    await api.createSale(data);
    fetchCards();
    fetchStats();
  };

  const handleBulkSell = async (order: CreateBulkOrderRequest) => {
    await api.createBulkOrder(order);
    fetchCards();
    fetchStats();
  };

  const handleCreateExpense = async (data: CreateExpenseRequest) => {
    await api.createExpense(data);
    await Promise.all([fetchExpenses(), fetchPerformanceSummary()]);
  };

  const handleUpdateExpense = async (
    id: number,
    data: UpdateExpenseRequest,
  ) => {
    await api.updateExpense(id, data);
    await Promise.all([fetchExpenses(), fetchPerformanceSummary()]);
  };

  const handleDeleteExpense = async (id: number) => {
    await api.deleteExpense(id);
    await Promise.all([fetchExpenses(), fetchPerformanceSummary()]);
  };

  const handleSaveExpenseSettings = async (
    data: UpdateExpenseSettingsRequest,
  ) => {
    await api.updateExpenseSettings(data);
    await fetchExpenseSettings();
  };

  const handleExpenseModalSubmit = async (
    data: CreateExpenseRequest | UpdateExpenseRequest,
  ) => {
    if (selectedExpenseForEdit) {
      await handleUpdateExpense(selectedExpenseForEdit.id, data);
    } else {
      await handleCreateExpense(data as CreateExpenseRequest);
    }

    setIsExpenseModalOpen(false);
    setSelectedExpenseForEdit(null);
  };

  const handleOpenCreateExpenseModal = () => {
    setSelectedExpenseForEdit(null);
    setIsExpenseModalOpen(true);
  };

  const handleOpenEditExpenseModal = (expense: Expense) => {
    setSelectedExpenseForEdit(expense);
    setIsExpenseModalOpen(true);
  };

  const handleCloseExpenseModal = () => {
    setIsExpenseModalOpen(false);
    setSelectedExpenseForEdit(null);
  };

  const handleDeleteExpenseRow = async (expense: Expense) => {
    if (!confirm('Delete this expense entry?')) return;

    try {
      await handleDeleteExpense(expense.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete expense');
    }
  };

  const handleOrderStatusChange = async (
    representativeSaleId: number,
    newStatus: OrderStatus,
  ) => {
    try {
      await api.updateSale(representativeSaleId, { orderStatus: newStatus });
      fetchSales();
      fetchPipeline();
      fetchSalesStats();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Failed to update sale status',
      );
    }
  };

  const handlePipelineSelect = (status: OrderStatus) => {
    setSalesStatusFilter((prev) => (prev === status ? undefined : status));
    setSalesPage(1);
  };

  const handleShipAction = (order: SalesOrder) => {
    setShipModalOrder(order);
  };

  const handleShipmentSubmit = async (payload: ShipmentSubmitPayload) => {
    if (payload.mode === 'create') {
      await api.createShipment(payload.saleId, payload.data);
    } else {
      await api.updateShipment(payload.shipmentId, payload.data);
    }
    setShipModalOrder(null);
    fetchSales();
    fetchPipeline();
    fetchSalesStats();
  };

  const handleChangeView = (view: ViewMode) => {
    setActiveView(view);

    if (view === 'sales-history') {
      setSalesSearch('');
      setSalesPage(1);
      setSalesStatusFilter(undefined);
      setShipModalOrder(null);
      return;
    }

    if (view === 'performance') {
      setExpensePage(1);
      setIsExpenseModalOpen(false);
      setSelectedExpenseForEdit(null);
      return;
    }

    setStatusFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
    setIsExpenseModalOpen(false);
    setSelectedExpenseForEdit(null);
  };

  const handleClosePriceCheckSettings = useCallback(() => {
    setIsPriceCheckSettingsOpen(false);
  }, []);

  const handleCloseNotificationHistory = useCallback(() => {
    setIsNotificationHistoryOpen(false);
  }, []);

  const handleCardSortChange = (field: SortField, direction: SortDirection) => {
    setCardSortField(field);
    setCardSortDirection(direction);
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: StatusFilter) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleExpenseFilterChange = <K extends keyof ExpenseFilters>(
    key: K,
    value: ExpenseFilters[K],
  ) => {
    setExpenseFilters((prev) => ({ ...prev, [key]: value }));
    setExpensePage(1);
  };

  const handleExpenseSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setExpensePage(1);
  };

  const handleClearExpenseFilters = () => {
    setExpenseFilters({
      category: undefined,
      source: undefined,
      search: '',
      dateFrom: '',
      dateTo: '',
    });
    setExpensePage(1);
  };

  const activeInventoryQuantity = stats
    ? Math.max(0, stats.total - (stats.sold ?? 0) - (stats.gifted ?? 0))
    : undefined;
  const needsAttentionCount = stats?.needs_attention ?? 0;
  const priceCheckSubtitle = getPriceCheckSubtitle(
    priceCheckStatus,
    priceCheckLoading,
  );
  const statusFilters: Array<{
    value: StatusFilter;
    label: string;
    count?: number;
  }> = [
    { value: 'all', label: 'All', count: activeInventoryQuantity },
    { value: 'listed', label: 'Listed (On Sale)', count: stats?.listed },
    {
      value: 'needs_attention',
      label: 'Needs Attention',
      count: stats?.needs_attention,
    },
    { value: 'pending', label: 'Pending', count: stats?.pending },
    { value: 'matched', label: 'Ready to List', count: stats?.matched },
    { value: 'error', label: 'Error', count: stats?.error },
  ];

  return (
    <div className="app app-shell">
      <header className="app-header app-shell-header">
        <div className="app-header-top app-shell-header-top">
          <h1 className="shell-brand" aria-label="TCGPLAYER AUTOMATION">
            <Box
              className="shell-brand-icon"
              aria-hidden="true"
              size={18}
              strokeWidth={1.5}
            />
            <span className="shell-brand-mark">TCGPLAYER</span>
            <span className="shell-brand-product">Automation</span>
          </h1>

          <ViewTabs activeView={activeView} onChangeView={handleChangeView} />

          <div className="header-icon-actions shell-utility-actions">
            <button
              type="button"
              className="theme-toggle shell-utility-button"
              onClick={toggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              aria-pressed={theme === 'dark'}
              title={
                theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
            >
              {theme === 'dark' ? (
                <Moon aria-hidden="true" size={19} strokeWidth={1.5} />
              ) : (
                <Sun aria-hidden="true" size={19} strokeWidth={1.5} />
              )}
            </button>
            <button
              ref={notificationHistoryTriggerRef}
              type="button"
              className="notification-history-trigger shell-utility-button"
              onClick={() => setIsNotificationHistoryOpen(true)}
              aria-label="Notifications"
              title="Notifications"
              aria-haspopup="dialog"
              aria-expanded={isNotificationHistoryOpen}
            >
              <Bell aria-hidden="true" size={19} strokeWidth={1.5} />
            </button>
            <button
              ref={priceCheckSettingsTriggerRef}
              type="button"
              className="price-check-settings-trigger shell-utility-button"
              onClick={() => setIsPriceCheckSettingsOpen(true)}
              aria-label="Price Check Settings"
              title="Price Check Settings"
              aria-haspopup="dialog"
              aria-expanded={isPriceCheckSettingsOpen}
            >
              <Settings aria-hidden="true" size={19} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main className="app-main app-shell-main" id="dashboard-panel">
        <StatsBar stats={stats} loading={statsLoading} />

        {activeView === 'sales-history' ? (
          <section className="cards-section">
            <div className="section-header">
              <h2>Sales History</h2>
            </div>

            <SalesStatsBar stats={salesStats} loading={salesStatsLoading} />

            <SalesPipelineCard
              pipeline={pipeline}
              activeStatus={salesStatusFilter}
              onSelectStatus={handlePipelineSelect}
            />

            <div className="filters">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSalesPage(1);
                }}
                className="search-form"
              >
                <input
                  type="text"
                  placeholder="Search by card, buyer, or order ID..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="search-input"
                />
                <button
                  type="submit"
                  className="search-button"
                  aria-label="Search sales"
                >
                  Search
                </button>
              </form>
            </div>

            <SalesTable
              orders={orders}
              loading={salesLoading}
              onStatusChange={handleOrderStatusChange}
              onShip={handleShipAction}
            />

            {shipModalOrder !== null && (
              <ShipmentFormModal
                saleId={shipModalOrder.representativeSaleId}
                shipment={shipModalOrder.shipment}
                onSubmit={handleShipmentSubmit}
                onClose={() => setShipModalOrder(null)}
              />
            )}

            <Pagination
              currentPage={salesPage}
              totalItems={salesTotalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setSalesPage}
            />
          </section>
        ) : activeView === 'collection' ? (
          <CollectionView onInventoryChanged={fetchCards} />
        ) : activeView === 'performance' ? (
          <section className="cards-section">
            <div className="section-header">
              <h2>Performance</h2>
              <div className="button-group">
                <button
                  onClick={handleOpenCreateExpenseModal}
                  className="button-primary"
                >
                  ➕ Add Expense
                </button>
              </div>
            </div>

            <div className="performance-card-grid">
              {performanceSummaryLoading && performanceSummary === null ? (
                <div className="table-loading">
                  <p>⏳ Loading performance summary...</p>
                </div>
              ) : performanceSummary ? (
                <PerformanceSummaryCard summary={performanceSummary} />
              ) : (
                <div className="table-empty">
                  Unable to load performance summary.
                </div>
              )}

              {expenseSettingsLoading && expenseSettings === null ? (
                <div className="table-loading">
                  <p>⏳ Loading expense settings...</p>
                </div>
              ) : expenseSettings ? (
                <ExpenseSettingsCard
                  settings={expenseSettings}
                  onSave={handleSaveExpenseSettings}
                />
              ) : (
                <div className="table-empty">
                  Unable to load expense settings.
                </div>
              )}
            </div>

            <div className="filters performance-filters">
              <div className="performance-filter-field">
                <label htmlFor="expense-filter-category">Category</label>
                <select
                  id="expense-filter-category"
                  value={expenseFilters.category ?? ''}
                  onChange={(e) =>
                    handleExpenseFilterChange(
                      'category',
                      (e.target.value || undefined) as
                        | ExpenseCategory
                        | undefined,
                    )
                  }
                  className="shipment-select"
                >
                  <option value="">All categories</option>
                  <option value="supplies">Supplies</option>
                  <option value="shipping">Shipping</option>
                  <option value="tcgplayer_fees">TCGplayer Fees</option>
                  <option value="inventory_acquisition">
                    Inventory Acquisition
                  </option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="performance-filter-field">
                <label htmlFor="expense-filter-source">Source</label>
                <select
                  id="expense-filter-source"
                  value={expenseFilters.source ?? ''}
                  onChange={(e) =>
                    handleExpenseFilterChange(
                      'source',
                      (e.target.value || undefined) as
                        | ExpenseSource
                        | undefined,
                    )
                  }
                  className="shipment-select"
                >
                  <option value="">All sources</option>
                  <option value="manual">Manual</option>
                  <option value="sale_auto_estimate">Auto-estimate</option>
                </select>
              </div>

              <div className="performance-filter-field">
                <label htmlFor="expense-filter-date-from">From</label>
                <input
                  id="expense-filter-date-from"
                  type="date"
                  value={expenseFilters.dateFrom}
                  onChange={(e) =>
                    handleExpenseFilterChange('dateFrom', e.target.value)
                  }
                  className="shipment-input"
                />
              </div>

              <div className="performance-filter-field">
                <label htmlFor="expense-filter-date-to">To</label>
                <input
                  id="expense-filter-date-to"
                  type="date"
                  value={expenseFilters.dateTo}
                  onChange={(e) =>
                    handleExpenseFilterChange('dateTo', e.target.value)
                  }
                  className="shipment-input"
                />
              </div>

              <form
                onSubmit={handleExpenseSearchSubmit}
                className="search-form performance-search-form"
              >
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={expenseFilters.search}
                  onChange={(e) =>
                    handleExpenseFilterChange('search', e.target.value)
                  }
                  className="search-input"
                />
                <button type="submit" className="search-button">
                  🔍
                </button>
              </form>

              <button
                type="button"
                className="button-secondary"
                onClick={handleClearExpenseFilters}
              >
                Reset Filters
              </button>
            </div>

            {expensesLoading && expenses.length === 0 ? (
              <div className="table-loading">
                <p>⏳ Loading expenses...</p>
              </div>
            ) : (
              <ExpenseTable
                expenses={expenses}
                total={expenseTotalItems}
                page={expensePage}
                limit={expenseLimit}
                onPageChange={setExpensePage}
                onEdit={handleOpenEditExpenseModal}
                onDelete={handleDeleteExpenseRow}
              />
            )}

            {isExpenseModalOpen && (
              <ExpenseFormModal
                expense={selectedExpenseForEdit ?? undefined}
                onSubmit={handleExpenseModalSubmit}
                onClose={handleCloseExpenseModal}
              />
            )}
          </section>
        ) : (
          <section className="cards-section inventory-workspace" aria-labelledby="inventory-title">
            <div className="section-header inventory-section-header">
              <div className="inventory-section-title-group">
                <h2 id="inventory-title">Selling Inventory</h2>
                {priceCheckSubtitle && (
                  <p className="inventory-price-freshness">{priceCheckSubtitle}</p>
                )}
              </div>
              <div className="button-group inventory-header-actions">
                <button
                  type="button"
                  onClick={handleFetchPrices}
                  disabled={fetchingPrices}
                  className="inventory-header-action inventory-header-action--fetch"
                  title="Fetch latest market prices from TCGTracking API"
                >
                  {fetchingPrices ? (
                    <LoaderCircle
                      className="inventory-loading-icon"
                      size={16}
                      aria-hidden="true"
                    />
                  ) : (
                    <RefreshCw size={16} aria-hidden="true" />
                  )}
                  <span>{fetchingPrices ? 'Fetching prices' : 'Fetch Latest Prices'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRepriceAll}
                  disabled={repricingAll || cards.length === 0}
                  className="inventory-header-action inventory-header-action--reprice"
                >
                  {repricingAll ? (
                    <LoaderCircle
                      className="inventory-loading-icon"
                      size={16}
                      aria-hidden="true"
                    />
                  ) : (
                    <DollarSign size={16} aria-hidden="true" />
                  )}
                  <span>{repricingAll ? 'Re-pricing' : 'Re-price All'}</span>
                </button>
              </div>
            </div>

            {needsAttentionCount > 0 && (
              <aside
                className="inventory-attention-banner"
                aria-label="Needs Attention pricing review"
              >
                <div className="inventory-attention-banner__message">
                  <AlertTriangle size={18} aria-hidden="true" />
                  <div>
                    <strong>
                      {needsAttentionCount} inventory{' '}
                      {needsAttentionCount === 1 ? 'item needs' : 'items need'} attention.
                    </strong>
                    <p>Review pricing across every Needs Attention card.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inventory-attention-banner__action"
                  onClick={() => cardTableRef.current?.openNeedsAttentionReview()}
                >
                  Review pricing
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </aside>
            )}

            <div className="filters inventory-toolbar" data-testid="inventory-toolbar">
              {activeView === 'inventory' && (
                <div className="status-filters inventory-status-filters" aria-label="Inventory status filters">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => handleStatusFilter(filter.value)}
                      aria-pressed={statusFilter === filter.value}
                      className={`filter-button ${statusFilter === filter.value ? 'active' : ''}`}
                    >
                      <span>{filter.label}</span>
                      {filter.count !== undefined && (
                        <span className="inventory-filter-count">{filter.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSearch} className="search-form inventory-search-form">
                <input
                  type="text"
                  placeholder="Search by card name..."
                  aria-label="Search inventory by card name"
                  value={searchQuery}
                  onChange={(e) => handleSearchQueryChange(e.target.value)}
                  className="search-input"
                />
                <button type="submit" className="search-button" aria-label="Search inventory">
                  <Search size={16} aria-hidden="true" />
                </button>
              </form>
            </div>

            <CardTable
              ref={cardTableRef}
              cards={cards}
              loading={loading}
              onReprice={handleReprice}
              onDelete={handleDelete}
              onMarkListed={handleMarkListed}
              onUnlist={handleUnlist}
              onUpdateCard={handleUpdateCard}
              onRecordSale={handleRecordSale}
              onBulkSell={handleBulkSell}
              bulkMode={
                statusFilter === 'all'
                  ? 'all'
                  : statusFilter === 'matched'
                    ? 'list'
                    : 'sell'
              }
              enableSellFlow
              defaultShippingCollectedCents={
                expenseSettings?.defaultShippingCollectedCents ?? 149
              }
              needsAttentionCount={needsAttentionCount}
              onLoadNeedsAttentionReviewCards={fetchAllNeedsAttentionCards}
              showNeedsAttentionReviewLauncher={false}
              sortField={cardSortField}
              sortDirection={cardSortDirection}
              onSortChange={handleCardSortChange}
            />

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </section>
        )}
      </main>

      {isPriceCheckSettingsOpen && (
        <PriceCheckSettingsModal
          status={priceCheckStatus}
          loading={priceCheckLoading}
          error={priceCheckError}
          onClose={handleClosePriceCheckSettings}
          onUpdateInterval={handleUpdateInterval}
          onUpdateListedPriceAttentionThreshold={
            handleUpdateListedPriceAttentionThreshold
          }
        />
      )}

      {isNotificationHistoryOpen && (
        <NotificationHistoryModal
          events={notificationEvents}
          loading={notificationsLoading}
          error={notificationsError}
          onClose={handleCloseNotificationHistory}
        />
      )}
    </div>
  );
}
