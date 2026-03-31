import { useState, useEffect } from 'react';
import { api } from './api/client';
import type { Card, CardStats } from './api/types';
import { ImportUpload } from './components/ImportUpload';
import { StatsBar } from './components/StatsBar';
import { CardTable } from './components/CardTable';
import { Pagination } from './components/Pagination';
import './App.css';

type StatusFilter = 'all' | Card['status'];

export function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState<CardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [repricingAll, setRepricingAll] = useState(false);
  const [fetchingPrices, setFetchingPrices] = useState(false);
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

  useEffect(() => {
    fetchCards();
  }, [statusFilter, searchQuery, currentPage]);

  useEffect(() => {
    fetchStats();
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

  const handleUnlist = async (id: number) => {
    try {
      const updatedCard = await api.unlistCard(id);
      setCards(cards.map((c) => (c.id === id ? updatedCard : c)));
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unlist card');
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
        <ImportUpload onImportComplete={handleImportComplete} />

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
          />

          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </section>
      </main>
    </div>
  );
}
