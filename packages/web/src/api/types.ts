export interface Card {
  id: number;
  tcgplayerId: number | null;
  tcgProductId: number | null;
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
    | 'gifted'
    | 'sold'
    | 'error';
  attentionReason?:
    | 'listed_price_drift'
    | 'listed_missing_price'
    | 'listed_below_threshold'
    | null;
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
  sold: number;
  gifted?: number;
  error: number;
}

export interface GetCardsParams {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
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
  listedPriceAttentionThresholdPercent: number;
  listedPriceAttentionMinDiffCents: number;
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
  intervalHours?: number;
  listedPriceAttentionThresholdPercent?: number;
  listedPriceAttentionMinDiffCents?: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type ExpenseCategory =
  | 'supplies'
  | 'shipping'
  | 'tcgplayer_fees'
  | 'inventory_acquisition'
  | 'other';

export type ExpenseSource = 'manual' | 'sale_auto_estimate';

export type AutoExpenseKind =
  | 'shipping_order'
  | 'supplies_order'
  | 'transaction_flat_order'
  | 'marketplace_percent_line'
  | 'transaction_percent_line';

export interface Expense {
  id: number;
  occurredAt: string;
  amountCents: number;
  category: ExpenseCategory;
  subcategory: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitCostCents: number | null;
  source: ExpenseSource;
  isEstimate: boolean;
  autoKind: AutoExpenseKind | null;
  saleId: number | null;
  tcgplayerOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseRequest {
  amountCents: number;
  category: ExpenseCategory;
  occurredAt?: string;
  description?: string | null;
  subcategory?: string | null;
  quantity?: number;
  unit?: string | null;
  isEstimate?: boolean;
}

export type UpdateExpenseRequest = Partial<CreateExpenseRequest>;

export interface GetExpensesParams {
  page?: number;
  limit?: number;
  category?: ExpenseCategory;
  source?: ExpenseSource;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface GetExpensesResponse {
  expenses: Expense[];
  total: number;
  page: number;
  limit: number;
}

export interface PerformanceSummaryResponse {
  revenueCents: number;
  expensesCents: number;
  netProfitCents: number;
  marginPercent: number | null;
  salesCount: number;
  expenseCount: number;
  estimatedExpensesCents: number;
  estimatedTcgplayerFeesCents?: number;
  actualExpensesCents: number;
  byCategory: Array<{
    category: ExpenseCategory;
    totalCents: number;
    count: number;
  }>;
}

export interface ExpenseSettings {
  id: number;
  autoRecordSaleExpenses: boolean;
  autoRecordShipping: boolean;
  shippingCostCents: number;
  defaultShippingCollectedCents?: number;
  autoRecordSupplies: boolean;
  suppliesCostCents: number;
  autoRecordTcgplayerFees: boolean;
  marketplaceFeeBps: number;
  transactionFeeBps: number;
  transactionFlatFeeCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateExpenseSettingsRequest {
  autoRecordSaleExpenses?: boolean;
  autoRecordShipping?: boolean;
  shippingCostCents?: number;
  defaultShippingCollectedCents?: number;
  autoRecordSupplies?: boolean;
  suppliesCostCents?: number;
  autoRecordTcgplayerFees?: boolean;
  marketplaceFeeBps?: number;
  transactionFeeBps?: number;
  transactionFlatFeeCents?: number;
}

export type SaleLineItemType = 'sale' | 'gift';

export interface Sale {
  id: number;
  cardId: number | null;
  tcgplayerOrderId: string | null;
  quantitySold: number;
  lineItemType: SaleLineItemType;
  salePriceCents: number;
  shippingCollectedCents: number;
  buyerName: string | null;
  orderStatus: OrderStatus;
  soldAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  cardProductName?: string | null;
  cardSetName?: string | null;
}

export interface GetSalesParams {
  page?: number;
  limit?: number;
  orderStatus?: OrderStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderLineItem {
  id: number;
  cardId: number | null;
  quantitySold: number;
  lineItemType: SaleLineItemType;
  salePriceCents: number;
  cardProductName: string | null;
  cardSetName: string | null;
  cardCondition: string | null;
}

/** Order-facing Sales History facade over the legacy sale-line table. */
export interface SalesOrder {
  orderKey: string;
  tcgplayerOrderId: string | null;
  representativeSaleId: number;
  buyerName: string | null;
  orderStatus: OrderStatus;
  soldAt: string;
  notes: string | null;
  itemCount: number;
  productSubtotalCents: number;
  shippingCollectedCents: number;
  totalCents: number;
  shipment: Shipment | null;
  lineItems: OrderLineItem[];
}

export interface GetSalesResponse {
  orders: SalesOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateSaleRequest {
  cardId: number;
  quantitySold: number;
  salePriceCents: number;
  shippingCollectedCents?: number;
  lineItemType?: SaleLineItemType;
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
  applyEstimatedExpenses?: boolean;
}

export type CreateSaleResponse = Sale;

export interface BulkOrderLineRequest {
  cardId: number;
  quantitySold: number;
  salePriceCents: number;
  lineItemType: SaleLineItemType;
}

export interface CreateBulkOrderRequest {
  buyerName?: string | null;
  tcgplayerOrderId: string;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
  applyEstimatedExpenses?: boolean;
  shippingCollectedCents?: number;
  lines: BulkOrderLineRequest[];
}

export interface CreateBulkOrderResponse {
  sales: Sale[];
}

export interface UpdateSaleRequest {
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderStatus?: OrderStatus;
  soldAt?: string;
  notes?: string | null;
  shippingCollectedCents?: number;
}

export interface SaleStatusHistoryEntry {
  id: number;
  saleId?: number;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  source: 'manual' | 'api_sync';
  /** Optional server-provided transition reason, retained for history deduplication. */
  reason?: string | null;
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

export interface Shipment {
  id: number;
  saleId: number;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShipmentRequest {
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string;
  notes?: string | null;
}

export interface UpdateShipmentRequest {
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
}

export interface NotificationEvent {
  id: number;
  channel: string;
  eventType: string;
  message: string;
  success: boolean;
  error: string | null;
  saleId: number | null;
  cardId: number | null;
  tcgplayerOrderId: string | null;
  createdAt: string;
}

export interface GetNotificationEventsResponse {
  events: NotificationEvent[];
  limit: number;
}

export type CollectionPurpose = 'owned' | 'to_be_sold' | string;

export type CardKind =
  | 'normal'
  | 'legend'
  | 'battlefield'
  | 'rune'
  | 'token'
  | 'unknown';

export interface CollectionSummary {
  id: number;
  name: string;
  purpose?: CollectionPurpose;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetCollectionsResponse {
  collections: CollectionSummary[];
}

export interface CollectionSellabilityItemRef {
  id?: number;
  collectionItemId?: number;
  finish?: string | null;
  finishKind?: 'normal' | 'foil' | string | null;
  quantity: number;
  recommendedSellQuantity?: number;
  condition?: string | null;
  language?: string | null;
}

export interface CollectionSellabilityRow {
  catalogCardId: number;
  tcgProductId: number | null;
  productName: string;
  title: string | null;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  normalizedNumber: string | null;
  rarity: string | null;
  photoUrl: string | null;
  kind: CardKind;
  kindSource: 'explicit' | 'detected' | 'unknown';
  normalQty: number;
  foilQty: number;
  totalQty: number;
  keepTarget: number | null;
  keepNormalQty: number;
  keepFoilQty: number;
  sellNormalQty: number;
  sellFoilQty: number;
  excluded: boolean;
  excludedReason: string | null;
  needsClassification: boolean;
  reasons: string[];
  reasonCodes: string[];
  primaryReasonCode: string | null;
  opportunityType: 'foil_swap' | 'over_cap' | null;
  keepTargetSatisfiedByNormal: boolean;
  sourceItems?: CollectionSellabilityItemRef[];
  transferItems?: CollectionSellabilityItemRef[];
  blockers?: string[];
  items?: CollectionSellabilityItemRef[];
}

export interface GetCollectionSellabilityResponse {
  collection: CollectionSummary;
  summary: {
    sellNormalQty: number;
    sellFoilQty: number;
    excludedCards: number;
    needsClassificationCards: number;
  };
  rows: CollectionSellabilityRow[];
}

export interface UpdateCatalogCardMetadataRequest {
  cardKind?: CardKind | null;
}

export type CollectionImportMode = 'set' | 'merge';

export interface CollectionImportSummary {
  totalRows: number;
  parsedRows: number;
  matchedCatalogRows: number;
  createdCatalogRows: number;
  unresolvedRows: number;
  totalQuantity: number;
  normalQuantity: number;
  foilQuantity: number;
  warnings: string[];
}

export interface CollectionImportPreviewRow {
  rowNumber: number;
  catalogCardId?: number | null;
  tcgProductId?: number | null;
  productName: string;
  setName?: string | null;
  number?: string | null;
  condition?: string | null;
  finish?: string | null;
  quantity: number;
  status: 'matched' | 'created' | 'unresolved';
  warnings: string[];
}

export interface CollectionImportPreviewResponse {
  collection?: CollectionSummary;
  mode: CollectionImportMode | string;
  source?: string;
  summary: CollectionImportSummary;
  rows: CollectionImportPreviewRow[];
  warnings?: string[];
  errors?: string[];
}

export interface CollectionImportCommitResponse extends CollectionImportPreviewResponse {
  inserted: number;
  updated: number;
  items?: unknown[];
}

export interface CollectionTransferItemRequest {
  collectionItemId: number;
  quantity: number;
}

export interface CollectionTransferRequest {
  items: CollectionTransferItemRequest[];
}

export type CollectionTransferMessage =
  | string
  | {
      collectionItemId?: number;
      warning?: string;
      blocker?: string;
      message?: string;
    };

export interface CollectionTransferSummary {
  requestedItems?: number;
  transferableItems?: number;
  blockedItems?: number;
  transferQuantity?: number;
  createRows?: number;
  updateRows?: number;
  warnings: CollectionTransferMessage[];
  blockers: CollectionTransferMessage[];
}

export interface CollectionTransferPreviewRow {
  collectionItemId: number;
  catalogCardId: number;
  quantity: number;
  availableQuantity?: number;
  finish: 'Normal' | 'Foil' | 'normal' | 'foil' | string;
  condition?: string | null;
  inventoryCondition?: string | null;
  action: 'create' | 'update' | 'blocked' | string;
  targetCardId?: number | null;
  status:
    | 'matched'
    | 'needs_attention'
    | 'gift'
    | 'pending'
    | 'error'
    | null
    | string;
  marketPrice?: number | string | null;
  listingPrice?: number | string | null;
  warnings: CollectionTransferMessage[];
  blockers: CollectionTransferMessage[];
  card?: {
    productName?: string | null;
    setName?: string | null;
    setCode?: string | null;
    number?: string | null;
    collectorNumber?: string | null;
  } | null;
}

export interface CollectionTransferPreviewResponse {
  collection?: CollectionSummary;
  summary: CollectionTransferSummary;
  items: CollectionTransferPreviewRow[];
  warnings?: CollectionTransferMessage[];
  errors?: string[];
}

export interface CollectionTransferCommitResponse extends CollectionTransferPreviewResponse {
  transferredQuantity?: number;
  inserted?: number;
  updated?: number;
}

export interface ApiError {
  error: string;
  message: string;
}
