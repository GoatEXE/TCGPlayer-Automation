import { useState, useEffect } from 'react';
import { api } from './api/client';
import type {
  Card,
  CardStats,
  NotificationEvent,
  OrderStatus,
  PriceCheckStatus,
  Sale,
  SalesStats,
  SalesPipelineEntry,
  Shipment,
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
import { Pagination } from './components/Pagination';
import { ViewTabs } from './components/ViewTabs';
import type { ViewMode } from './components/ViewTabs';
import './App.css';

type StatusFilter = 'all' | Card['status'];

export function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState<CardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewMode>('inventory');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
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
  const itemsPerPage = 50;

  const fetchCards = async () => {
    setLoading(true);
    try {
      const response = await api.getCards({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined,
        page: currentPage,
        limit: itemsPerPage,
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

  useEffect(() => {
    if (activeView === 'sales-history') {
      fetchSales();
      fetchSalesStats();
      fetchPipeline();
      fetchNotifications();
    } else {
      fetchCards();
    }
  }, [
    activeView,
    statusFilter,
    searchQuery,
    currentPage,
    salesPage,
    salesSearch,
    salesStatusFilter,
  ]);

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
  }, []);

  const handleImportComplete = () => {
    fetchStats();
    fetchCards();
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
    } else {
      setStatusFilter(view === 'active-listings' ? 'listed' : 'all');
      setSearchQuery('');
      setCurrentPage(1);
    }
  };

  const handleStatusFilter = (status: StatusFilter) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'listed', label: 'Listed (On Sale)' },
    { value: 'gift', label: 'Gift' },
    { value: 'needs_attention', label: 'Needs Attention' },
    { value: 'pending', label: 'Pending' },
    { value: 'matched', label: 'Ready to List' },
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

            <NotificationHistoryPanel
              events={notificationEvents}
              loading={notificationsLoading}
              error={notificationsError}
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
        ) : (
          <section className="cards-section">
            <div className="section-header">
              <h2>
                {activeView === 'active-listings'
                  ? 'Active Listings'
                  : 'Card Inventory'}
              </h2>
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
                  onChange={(e) => setSearchQuery(e.target.value)}
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
