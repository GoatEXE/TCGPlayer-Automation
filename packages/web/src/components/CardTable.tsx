import { useState } from 'react';
import type { Card } from '../api/types';
import { StatusBadge } from './StatusBadge';

interface CardTableProps {
  cards: Card[];
  loading?: boolean;
  onReprice: (id: number) => void;
  onDelete: (id: number) => void;
}

type SortField = keyof Card | null;
type SortDirection = 'asc' | 'desc';

export function CardTable({ cards, loading, onReprice, onDelete }: CardTableProps) {
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [repricingId, setRepricingId] = useState<number | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedCards = [...cards].sort((a, b) => {
    if (!sortField) return 0;

    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this card?')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReprice = async (id: number) => {
    setRepricingId(id);
    try {
      await onReprice(id);
    } finally {
      setRepricingId(null);
    }
  };

  const formatPrice = (price: string | null) => {
    if (!price) return '—';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th onClick={() => handleSort(field)} className="sortable">
      {children}
      {sortField === field && (
        <span className="sort-indicator">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
      )}
    </th>
  );

  if (loading) {
    return (
      <div className="table-loading">
        <p>⏳ Loading cards...</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="table-empty">
        <p>No cards found. Import some cards to get started!</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="card-table">
        <thead>
          <tr>
            <SortableHeader field="status">Status</SortableHeader>
            <SortableHeader field="productName">Name</SortableHeader>
            <SortableHeader field="setName">Set</SortableHeader>
            <SortableHeader field="number">Number</SortableHeader>
            <SortableHeader field="rarity">Rarity</SortableHeader>
            <SortableHeader field="condition">Condition</SortableHeader>
            <SortableHeader field="quantity">Qty</SortableHeader>
            <SortableHeader field="marketPrice">Market</SortableHeader>
            <SortableHeader field="listingPrice">Listing</SortableHeader>
            <SortableHeader field="updatedAt">Updated</SortableHeader>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedCards.map((card) => (
            <tr key={card.id}>
              <td>
                <StatusBadge status={card.status} />
              </td>
              <td className="card-name">
                {card.title || card.productName}
                {card.photoUrl && (
                  <a
                    href={card.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="photo-link"
                    title="View photo"
                  >
                    🖼️
                  </a>
                )}
              </td>
              <td>{card.setName || '—'}</td>
              <td>{card.number || '—'}</td>
              <td>{card.rarity || '—'}</td>
              <td>{card.condition}</td>
              <td className="quantity">{card.quantity}</td>
              <td className="price">{formatPrice(card.marketPrice)}</td>
              <td className="price">{formatPrice(card.listingPrice)}</td>
              <td className="date">{formatDate(card.updatedAt)}</td>
              <td className="actions">
                <button
                  onClick={() => handleReprice(card.id)}
                  disabled={repricingId === card.id}
                  className="action-button reprice"
                  title="Re-price this card"
                >
                  {repricingId === card.id ? '⏳' : '💰'}
                </button>
                <button
                  onClick={() => handleDelete(card.id)}
                  disabled={deletingId === card.id}
                  className="action-button delete"
                  title="Delete this card"
                >
                  {deletingId === card.id ? '⏳' : '🗑️'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
