import type { Card } from '../../db/schema/cards.js';

export type PriceCheckCsvDiffAction =
  | 'add_listing'
  | 'remove_listing'
  | 'price_change';

export interface PriceCheckCsvDiffRow {
  action: PriceCheckCsvDiffAction;
  cardId: number;
  productName: string;
  previousStatus: Card['status'];
  newStatus: Card['status'];
  previousListingPrice: number | null;
  newListingPrice: number | null;
  driftPercent: number | null;
}

export interface PriceCheckCsvDiff {
  rows: PriceCheckCsvDiffRow[];
  csv: string;
}

const CSV_HEADER = [
  'action',
  'card_id',
  'product_name',
  'previous_status',
  'new_status',
  'previous_listing_price',
  'new_listing_price',
  'drift_percent',
] as const;

const ACTION_ORDER: Record<PriceCheckCsvDiffAction, number> = {
  add_listing: 0,
  remove_listing: 1,
  price_change: 2,
};

function formatDecimal(value: number | null): string {
  if (value === null) {
    return '';
  }

  return value.toFixed(2);
}

function escapeCsvValue(value: string): string {
  if (value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  if (value.includes(',') || value.includes('\n')) {
    return `"${value}"`;
  }

  return value;
}

function serializeRow(row: PriceCheckCsvDiffRow): string {
  const values = [
    row.action,
    String(row.cardId),
    row.productName,
    row.previousStatus,
    row.newStatus,
    formatDecimal(row.previousListingPrice),
    formatDecimal(row.newListingPrice),
    formatDecimal(row.driftPercent),
  ];

  return values.map(escapeCsvValue).join(',');
}

export function buildPriceCheckCsvDiff(
  rows: PriceCheckCsvDiffRow[],
): PriceCheckCsvDiff {
  const sortedRows = [...rows].sort((a, b) => {
    const actionDelta = ACTION_ORDER[a.action] - ACTION_ORDER[b.action];
    if (actionDelta !== 0) {
      return actionDelta;
    }

    return a.cardId - b.cardId;
  });

  const csvLines = [CSV_HEADER.join(',')];

  for (const row of sortedRows) {
    csvLines.push(serializeRow(row));
  }

  return {
    rows: sortedRows,
    csv: csvLines.join('\n'),
  };
}
