export interface Card {
  id: number;
  tcgplayerId: number | null;
  productLine: string;
  setName: string | null;
  productName: string;
  title: string | null;
  number: string | null;
  rarity: string | null;
  condition: string;
  quantity: number;
  status:
    | 'pending'
    | 'matched'
    | 'listed'
    | 'needs_attention'
    | 'gift'
    | 'error';
  marketPrice: string | null;
  listingPrice: string | null;
  floorPriceCents: number | null;
  isFoilPrice: boolean;
  photoUrl: string | null;
  notes: string | null;
  lastCheckedAt: string | null;
  importedAt: string;
  updatedAt: string;
}

export interface CardStats {
  total: number;
  pending: number;
  matched: number;
  listed: number;
  gift: number;
  needs_attention: number;
  error: number;
}

export interface GetCardsParams {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface GetCardsResponse {
  cards: Card[];
  total: number;
  page: number;
  limit: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  errors: string[];
  cards: Card[];
}

export interface RepriceAllResult {
  updated: number;
}

export interface FetchPricesResult {
  updated: number;
  notFound: number;
  drifted?: number;
  errors: string[];
}

export interface MarkListedResult {
  updated: number;
  errors: string[];
}

export interface PriceCheckLastRun {
  startedAt: string;
  finishedAt: string;
  success: boolean;
  updated: number;
  notFound: number;
  drifted: number;
  errors: string[];
}

export interface PriceCheckStatus {
  enabled: boolean;
  intervalHours: number;
  thresholdPercent: number;
  running: boolean;
  lastRun: PriceCheckLastRun | null;
}

export interface PriceHistoryEntry {
  id: number;
  cardId: number;
  checkedAt: string;
  source: string;
  previousMarketPrice: string | null;
  newMarketPrice: string | null;
  previousListingPrice: string | null;
  newListingPrice: string | null;
  driftPercent: string | null;
  previousStatus: string | null;
  newStatus: string | null;
}

export interface GetPriceHistoryResponse {
  history: PriceHistoryEntry[];
}

export interface UpdatePriceCheckSettingsRequest {
  intervalHours: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface Sale {
  id: number;
  cardId: number | null;
  tcgplayerOrderId: string | null;
  quantitySold: number;
  salePriceCents: number;
  buyerName: string | null;
  orderStatus: OrderStatus;
  soldAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cardProductName: string | null;
  cardSetName: string | null;
}

export interface GetSalesParams {
  page?: number;
  limit?: number;
  orderStatus?: OrderStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface GetSalesResponse {
  sales: Sale[];
  total: number;
  page: number;
  limit: number;
}

export interface SaleStatusHistoryEntry {
  id: number;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  source: 'manual' | 'api_sync';
  note: string | null;
  changedAt: string;
}

export interface GetSaleHistoryResponse {
  history: SaleStatusHistoryEntry[];
}

export interface BatchStatusUpdateRequest {
  saleIds: number[];
  newStatus: OrderStatus;
  note?: string | null;
}

export interface BatchStatusUpdateResponse {
  updated: number;
  skipped: { id: number; reason: string }[];
}

export interface SalesPipelineEntry {
  status: OrderStatus;
  count: number;
  totalCents: number;
}

export interface GetSalesPipelineResponse {
  pipeline: SalesPipelineEntry[];
}

export interface SalesStats {
  totalSales: number;
  totalRevenueCents: number;
  averageSaleCents: number;
  activeListingCount: number;
  totalListedCount: number;
}

export interface ApiError {
  error: string;
  message: string;
}
