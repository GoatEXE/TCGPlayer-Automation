import { useState, useEffect } from 'react';
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
  Sale,
  SalesStats,
  SalesPipelineEntry,
  Shipment,
  UpdateExpenseRequest,
  UpdateExpenseSettingsRequest,
} from './api/types';
import { SalesTable } from './components/SalesTable';
import { ImportUpload } from './components/ImportUpload';
import { StatsBar } from './components/StatsBar';
import { SalesStatsBar } from './components/SalesStatsBar';
import { SalesPipelineCard } from './components/SalesPipelineCard';
import { ShipmentFormModal } from './components/ShipmentFormModal';
import type { ShipmentSubmitPayload } from './components/ShipmentFormModal';
import { PriceCheckStatusCard } from './components/PriceCheckStatusCard';
import { NotificationHistoryPanel } from './components/NotificationHistoryPanel';
import { CardTable } from './components/CardTable';
import type { SortDirection, SortField } from './components/CardTable';
import { Pagination } from './components/Pagination';
import { PerformanceSummaryCard } from './components/PerformanceSummaryCard';
import { ExpenseSettingsCard } from './components/ExpenseSettingsCard';
import { ExpenseTable } from './components/ExpenseTable';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ViewTabs } from './components/ViewTabs';
import type { ViewMode } from './components/ViewTabs';
import './App.css';

type StatusFilter = 'all' | Card['status'];

interface ExpenseFilters {
  category?: ExpenseCategory;
  source?: ExpenseSource;
  search: string;
  dateFrom: string;
  dateTo: string;
}

export function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [giftCards, setGiftCards] = useState<Card[]>([]);
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
  const [sales, setSales] = useState<Sale[]>([]);
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
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<number>>(
    new Set(),
  );
  const [shipmentsMap, setShipmentsMap] = useState<Map<number, Shipment>>(
    new Map(),
  );
  const [shipModalSaleId, setShipModalSaleId] = useState<number | null>(null);
  const [notificationEvents, setNotificationEvents] = useState<
    NotificationEvent[]
  >([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(false);

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
      setCards(response.cards);
      setTotalItems(response.total);
    } catch (err) {
      console.error('Failed to fetch cards:', err);
      alert(err instanceof Error ? err.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  };

  const fetchGiftCards = async () => {
    try {
      const response = await api.getCards({
        status: 'gift',
        page: 1,
        limit: 200,
        sortField: 'productName',
        sortDirection: 'asc',
      });
      setGiftCards(response.cards);
    } catch (err) {
      console.error('Failed to fetch gift cards:', err);
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
      setSales(response.sales);
      setSalesTotalItems(response.total);
    } catch (err) {
      console.error('Failed to fetch sales:', err);
      alert(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setSalesLoading(false);
    }
  };

  const fetchShipments = async (saleIds: number[]) => {
    const next = new Map(shipmentsMap);
    await Promise.all(
      saleIds.map(async (id) => {
        try {
          const shipment = await api.getShipment(id);
          next.set(id, shipment);
        } catch {
          // 404 = no shipment, skip
        }
      }),
    );
    setShipmentsMap(next);
  };

  const fetchNotifications = async () => {
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
  };

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
  }, [activeView, statusFilter, searchQuery, currentPage, cardSortField, cardSortDirection]);

  useEffect(() => {
    if (activeView === 'inventory') {
      fetchGiftCards();
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView !== 'sales-history') return;
    fetchSales();
    fetchSalesStats();
    fetchPipeline();
  }, [activeView, salesPage, salesSearch, salesStatusFilter]);

  useEffect(() => {
    if (activeView !== 'notifications') return;
    fetchNotifications();
  }, [activeView]);

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

  useEffect(() => {
    if (activeView === 'sales-history' && sales.length > 0) {
      const saleIds = sales.map((s) => s.id);
      fetchShipments(saleIds);
    }
  }, [sales]);

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

  const handleImportComplete = () => {
    fetchStats();
    fetchCards();
    fetchGiftCards();
  };

  const handleReprice = async (id: number) => {
    try {
      const updatedCard = await api.repriceCard(id);
      setCards(cards.map((c) => (c.id === id ? updatedCard : c)));
      fetchStats();
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
  ) => {
    const updated = await api.updatePriceCheckSettings({
      listedPriceAttentionThresholdPercent,
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
    fetchGiftCards();
  };

  const handleCreateExpense = async (data: CreateExpenseRequest) => {
    await api.createExpense(data);
    await Promise.all([fetchExpenses(), fetchPerformanceSummary()]);
  };

  const handleUpdateExpense = async (id: number, data: UpdateExpenseRequest) => {
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

  const handleSaleStatusChange = async (
    saleId: number,
    newStatus: OrderStatus,
  ) => {
    try {
      await api.updateSale(saleId, { orderStatus: newStatus });
      fetchSales();
      fetchPipeline();
      fetchSalesStats();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Failed to update sale status',
      );
    }
  };

  const handleBatchStatusUpdate = async (newStatus: OrderStatus) => {
    if (selectedSaleIds.size === 0) return;
    try {
      const result = await api.batchUpdateSaleStatus({
        saleIds: Array.from(selectedSaleIds),
        newStatus,
      });
      let message = `✅ Updated ${result.updated} sale${result.updated !== 1 ? 's' : ''}`;
      if (result.skipped.length > 0) {
        message += `\n\n⚠️ Skipped ${result.skipped.length}:\n${result.skipped.map((s) => `#${s.id}: ${s.reason}`).join('\n')}`;
      }
      alert(message);
      setSelectedSaleIds(new Set());
      fetchSales();
      fetchPipeline();
      fetchSalesStats();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Failed to batch update status',
      );
    }
  };

  const handlePipelineSelect = (status: OrderStatus) => {
    setSalesStatusFilter((prev) => (prev === status ? undefined : status));
    setSalesPage(1);
  };

  const handleShipAction = (saleId: number) => {
    setShipModalSaleId(saleId);
  };

  const handleShipmentSubmit = async (payload: ShipmentSubmitPayload) => {
    if (payload.mode === 'create') {
      await api.createShipment(payload.saleId, payload.data);
    } else {
      await api.updateShipment(payload.shipmentId, payload.data);
    }
    setShipModalSaleId(null);
    fetchSales();
    fetchPipeline();
    fetchSalesStats();
    // Refresh shipment for the affected sale
    const saleId =
      payload.mode === 'create' ? payload.saleId : shipModalSaleId!;
    try {
      const shipment = await api.getShipment(saleId);
      setShipmentsMap((prev) => new Map(prev).set(saleId, shipment));
    } catch {
      // ignore
    }
  };

  const handleChangeView = (view: ViewMode) => {
    setActiveView(view);

    if (view === 'sales-history') {
      setSalesSearch('');
      setSalesPage(1);
      setSalesStatusFilter(undefined);
      setSelectedSaleIds(new Set());
      setShipmentsMap(new Map());
      setShipModalSaleId(null);
      return;
    }

    if (view === 'notifications') {
      setIsExpenseModalOpen(false);
      setSelectedExpenseForEdit(null);
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

  const handleCardSortChange = (
    field: SortField,
    direction: SortDirection,
  ) => {
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

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'listed', label: 'Listed (On Sale)' },
    { value: 'gift', label: 'Gift' },
    { value: 'needs_attention', label: 'Needs Attention' },
    { value: 'pending', label: 'Pending' },
    { value: 'matched', label: 'Ready to List' },
    { value: 'sold', label: 'Sold' },
    { value: 'error', label: 'Error' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1>📦 TCGPlayer Automation</h1>
        <StatsBar stats={stats} loading={statsLoading} />
      </header>

      <main className="app-main">
        <div className="actions-row">
          <ImportUpload onImportComplete={handleImportComplete} />
          <PriceCheckStatusCard
            status={priceCheckStatus}
            loading={priceCheckLoading}
            error={priceCheckError}
            onUpdateInterval={handleUpdateInterval}
            onUpdateListedPriceAttentionThreshold={
              handleUpdateListedPriceAttentionThreshold
            }
          />
        </div>

        <ViewTabs activeView={activeView} onChangeView={handleChangeView} />

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

            {selectedSaleIds.size > 0 && (
              <div className="selection-actions">
                <span>
                  {selectedSaleIds.size} sale
                  {selectedSaleIds.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  className="button-primary"
                  onClick={() => handleBatchStatusUpdate('confirmed')}
                >
                  ✅ Confirm
                </button>
                <button
                  className="button-primary"
                  onClick={() => handleBatchStatusUpdate('shipped')}
                >
                  📦 Ship
                </button>
                <button
                  className="button-primary"
                  onClick={() => handleBatchStatusUpdate('delivered')}
                >
                  🏠 Delivered
                </button>
                <button
                  className="button-secondary"
                  onClick={() => handleBatchStatusUpdate('cancelled')}
                >
                  ❌ Cancel
                </button>
              </div>
            )}

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
                <button type="submit" className="search-button">
                  🔍
                </button>
              </form>
            </div>

            <SalesTable
              sales={sales}
              loading={salesLoading}
              onStatusChange={handleSaleStatusChange}
              selectedIds={selectedSaleIds}
              onSelectionChange={setSelectedSaleIds}
              shipments={shipmentsMap}
              onShip={handleShipAction}
            />

            {shipModalSaleId !== null && (
              <ShipmentFormModal
                saleId={shipModalSaleId}
                shipment={shipmentsMap.get(shipModalSaleId) ?? null}
                onSubmit={handleShipmentSubmit}
                onClose={() => setShipModalSaleId(null)}
              />
            )}

            <Pagination
              currentPage={salesPage}
              totalItems={salesTotalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setSalesPage}
            />
          </section>
        ) : activeView === 'notifications' ? (
          <section className="cards-section">
            <div className="section-header">
              <h2>Notifications</h2>
            </div>
            <NotificationHistoryPanel
              events={notificationEvents}
              loading={notificationsLoading}
              error={notificationsError}
            />
          </section>
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
                <div className="table-empty">Unable to load performance summary.</div>
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
                <div className="table-empty">Unable to load expense settings.</div>
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
                      (e.target.value || undefined) as ExpenseSource | undefined,
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
                  onChange={(e) => handleExpenseFilterChange('dateTo', e.target.value)}
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
          <section className="cards-section">
            <div className="section-header">
              <h2>Card Inventory</h2>
              <div className="button-group">
                <button
                  onClick={handleFetchPrices}
                  disabled={fetchingPrices}
                  className="button-primary"
                  title="Fetch latest market prices from TCGTracking API"
                >
                  {fetchingPrices ? '⏳ Fetching...' : '🔄 Fetch Latest Prices'}
                </button>
                <button
                  onClick={handleRepriceAll}
                  disabled={repricingAll || cards.length === 0}
                  className="button-primary"
                >
                  {repricingAll ? '⏳ Re-pricing...' : '💰 Re-price All'}
                </button>
              </div>
            </div>

            <div className="filters">
              {activeView === 'inventory' && (
                <div className="status-filters">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => handleStatusFilter(filter.value)}
                      className={`filter-button ${statusFilter === filter.value ? 'active' : ''}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSearch} className="search-form">
                <input
                  type="text"
                  placeholder="Search by card name..."
                  value={searchQuery}
                  onChange={(e) => handleSearchQueryChange(e.target.value)}
                  className="search-input"
                />
                <button type="submit" className="search-button">
                  🔍
                </button>
              </form>
            </div>

            <CardTable
              cards={cards}
              loading={loading}
              onReprice={handleReprice}
              onDelete={handleDelete}
              onMarkListed={handleMarkListed}
              onUnlist={handleUnlist}
              onUpdateCard={handleUpdateCard}
              onRecordSale={handleRecordSale}
              onBulkSell={handleBulkSell}
              giftCards={giftCards}
              onPrepareBulkSell={fetchGiftCards}
              bulkMode={statusFilter === 'matched' ? 'list' : 'sell'}
              enableSellFlow
              defaultShippingCollectedCents={
                expenseSettings?.defaultShippingCollectedCents ?? 149
              }
              needsAttentionCount={stats?.needs_attention ?? 0}
              onLoadNeedsAttentionReviewCards={fetchAllNeedsAttentionCards}
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
    </div>
  );
}
