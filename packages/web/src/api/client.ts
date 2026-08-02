import type {
  Card,
  CardStats,
  GetCardsParams,
  GetCardsResponse,
  ImportResult,
  RepriceAllResult,
  FetchPricesResult,
  MarkListedResult,
  PriceCheckStatus,
  UpdatePriceCheckSettingsRequest,
  GetPriceHistoryResponse,
  Expense,
  GetExpensesParams,
  GetExpensesResponse,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  PerformanceSummaryResponse,
  ExpenseSettings,
  UpdateExpenseSettingsRequest,
  Sale,
  GetSalesParams,
  GetSalesResponse,
  SalesStats,
  CreateSaleRequest,
  CreateBulkOrderRequest,
  CreateBulkOrderResponse,
  UpdateSaleRequest,
  GetSaleHistoryResponse,
  BatchStatusUpdateRequest,
  BatchStatusUpdateResponse,
  GetSalesPipelineResponse,
  Shipment,
  CreateShipmentRequest,
  UpdateShipmentRequest,
  GetNotificationEventsResponse,
  GetCollectionsResponse,
  GetCollectionSellabilityResponse,
  CollectionImportCommitResponse,
  CollectionImportMode,
  CollectionImportPreviewResponse,
  CollectionTransferCommitResponse,
  CollectionTransferRequest,
  CollectionTransferPreviewResponse,
  BulkCollectionItemsRequest,
  BulkCollectionItemsResponse,
  UpdateCatalogCardMetadataRequest,
} from './types';

const API_BASE = '/api';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string>),
    };
    // Only set Content-Type for requests with a body
    if (options?.body) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Request failed' }));
      throw new Error(
        error.error || error.message || `HTTP ${response.status}`,
      );
    }

    return response.json();
  }

  async getCards(params?: GetCardsParams): Promise<GetCardsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortField) searchParams.set('sortField', params.sortField);
    if (params?.sortDirection)
      searchParams.set('sortDirection', params.sortDirection);

    const query = searchParams.toString();
    return this.request<GetCardsResponse>(`/cards${query ? `?${query}` : ''}`);
  }

  async getStats(): Promise<CardStats> {
    return this.request<CardStats>('/cards/stats');
  }

  async importCards(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/cards/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Import failed' }));
      throw new Error(
        error.error || error.message || `HTTP ${response.status}`,
      );
    }

    return response.json();
  }

  async updateCard(id: number, data: Partial<Card>): Promise<Card> {
    return this.request<Card>(`/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCard(id: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/cards/${id}`, {
      method: 'DELETE',
    });
  }

  async repriceCard(id: number): Promise<Card> {
    return this.request<Card>(`/cards/${id}/reprice`, {
      method: 'POST',
    });
  }

  async repriceAll(): Promise<RepriceAllResult> {
    return this.request<RepriceAllResult>('/cards/reprice-all', {
      method: 'POST',
    });
  }

  async fetchPrices(): Promise<FetchPricesResult> {
    return this.request<FetchPricesResult>('/cards/fetch-prices', {
      method: 'POST',
    });
  }

  async markListed(cardIds: number[]): Promise<MarkListedResult> {
    return this.request<MarkListedResult>('/cards/mark-listed', {
      method: 'POST',
      body: JSON.stringify({ cardIds }),
    });
  }

  async unlistCard(id: number): Promise<Card> {
    return this.request<Card>(`/cards/${id}/unlist`, {
      method: 'POST',
    });
  }

  async getPriceCheckStatus(): Promise<PriceCheckStatus> {
    return this.request<PriceCheckStatus>('/cards/price-check-status');
  }

  async updatePriceCheckSettings(
    settings: UpdatePriceCheckSettingsRequest,
  ): Promise<PriceCheckStatus> {
    return this.request<PriceCheckStatus>('/cards/price-check-settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getCardPriceHistory(
    cardId: number,
    limit?: number,
  ): Promise<GetPriceHistoryResponse> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return this.request<GetPriceHistoryResponse>(
      `/cards/${cardId}/price-history${query ? `?${query}` : ''}`,
    );
  }

  async getExpenses(params?: GetExpensesParams): Promise<GetExpensesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.category) searchParams.set('category', params.category);
    if (params?.source) searchParams.set('source', params.source);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return this.request<GetExpensesResponse>(
      `/expenses${query ? `?${query}` : ''}`,
    );
  }

  async createExpense(data: CreateExpenseRequest): Promise<Expense> {
    return this.request<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateExpense(id: number, data: UpdateExpenseRequest): Promise<Expense> {
    return this.request<Expense>(`/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteExpense(id: number): Promise<void> {
    await this.request<{ success: boolean }>(`/expenses/${id}`, {
      method: 'DELETE',
    });
  }

  async getPerformanceSummary(params?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PerformanceSummaryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return this.request<PerformanceSummaryResponse>(
      `/expenses/performance${query ? `?${query}` : ''}`,
    );
  }

  async getExpenseSettings(): Promise<ExpenseSettings> {
    return this.request<ExpenseSettings>('/expenses/settings');
  }

  async updateExpenseSettings(
    data: UpdateExpenseSettingsRequest,
  ): Promise<ExpenseSettings> {
    return this.request<ExpenseSettings>('/expenses/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createSale(data: CreateSaleRequest): Promise<Sale> {
    return this.request<Sale>('/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createBulkOrder(
    data: CreateBulkOrderRequest,
  ): Promise<CreateBulkOrderResponse> {
    return this.request<CreateBulkOrderResponse>('/sales/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSales(params?: GetSalesParams): Promise<GetSalesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.orderStatus)
      searchParams.set('orderStatus', params.orderStatus);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return this.request<GetSalesResponse>(`/sales${query ? `?${query}` : ''}`);
  }

  async updateSale(id: number, data: UpdateSaleRequest): Promise<Sale> {
    return this.request<Sale>(`/sales/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getSalesStats(): Promise<SalesStats> {
    return this.request<SalesStats>('/sales/stats');
  }

  async getSaleStatusHistory(saleId: number): Promise<GetSaleHistoryResponse> {
    return this.request<GetSaleHistoryResponse>(`/sales/${saleId}/history`);
  }

  async batchUpdateSaleStatus(
    request: BatchStatusUpdateRequest,
  ): Promise<BatchStatusUpdateResponse> {
    return this.request<BatchStatusUpdateResponse>('/sales/batch-status', {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
  }

  async getSalesPipeline(): Promise<GetSalesPipelineResponse> {
    return this.request<GetSalesPipelineResponse>('/sales/pipeline');
  }

  async createShipment(
    saleId: number,
    data: CreateShipmentRequest,
  ): Promise<Shipment> {
    return this.request<Shipment>(`/sales/${saleId}/ship`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getShipment(saleId: number): Promise<Shipment> {
    return this.request<Shipment>(`/sales/${saleId}/shipment`);
  }

  getInvoiceUrl(saleId: number): string {
    return `${API_BASE}/sales/${saleId}/invoice`;
  }

  getPackingSlipUrl(saleId: number): string {
    return `${API_BASE}/sales/${saleId}/packing-slip`;
  }

  async updateShipment(
    shipmentId: number,
    data: UpdateShipmentRequest,
  ): Promise<Shipment> {
    return this.request<Shipment>(`/shipments/${shipmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getNotificationEvents(
    limit?: number,
  ): Promise<GetNotificationEventsResponse> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const query = params.toString();
    return this.request<GetNotificationEventsResponse>(
      `/notifications${query ? `?${query}` : ''}`,
    );
  }

  async getCollections(): Promise<GetCollectionsResponse> {
    return this.request<GetCollectionsResponse>('/collections');
  }

  async getCollectionSellability(
    collectionId: number | string,
  ): Promise<GetCollectionSellabilityResponse> {
    return this.request<GetCollectionSellabilityResponse>(
      `/collections/${encodeURIComponent(String(collectionId))}/sellability`,
    );
  }

  async previewCollectionImport(
    collectionId: number | string,
    file: File,
    mode: CollectionImportMode,
  ): Promise<CollectionImportPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    const response = await fetch(
      `${API_BASE}/collections/${encodeURIComponent(String(collectionId))}/import/preview`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Collection import preview failed' }));
      throw new Error(
        error.error || error.message || `HTTP ${response.status}`,
      );
    }

    return response.json();
  }

  async commitCollectionImport(
    collectionId: number | string,
    file: File,
    mode: CollectionImportMode,
  ): Promise<CollectionImportCommitResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    const response = await fetch(
      `${API_BASE}/collections/${encodeURIComponent(String(collectionId))}/import`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Collection import failed' }));
      throw new Error(
        error.error || error.message || `HTTP ${response.status}`,
      );
    }

    return response.json();
  }

  async clearCollection(
    collectionId: number | string,
    confirmation: string,
  ): Promise<{ deleted?: number; removed?: number; collection?: unknown }> {
    return this.request<{ deleted?: number; removed?: number; collection?: unknown }>(
      `/collections/${encodeURIComponent(String(collectionId))}/clear`,
      {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      },
    );
  }

  async previewCollectionTransferToInventory(
    collectionId: number | string,
    data: CollectionTransferRequest,
  ): Promise<CollectionTransferPreviewResponse> {
    return this.request<CollectionTransferPreviewResponse>(
      `/collections/${encodeURIComponent(String(collectionId))}/transfer-to-inventory/preview`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  }

  async commitCollectionTransferToInventory(
    collectionId: number | string,
    data: CollectionTransferRequest,
  ): Promise<CollectionTransferCommitResponse> {
    return this.request<CollectionTransferCommitResponse>(
      `/collections/${encodeURIComponent(String(collectionId))}/transfer-to-inventory`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  }

  async addCollectionItemsBulk(
    collectionId: number | string,
    data: BulkCollectionItemsRequest,
  ): Promise<BulkCollectionItemsResponse> {
    return this.request<BulkCollectionItemsResponse>(
      `/collections/${encodeURIComponent(String(collectionId))}/items/bulk`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  }

  async updateCatalogCardMetadata(
    catalogCardId: number | string,
    data: UpdateCatalogCardMetadataRequest,
  ): Promise<{ card: unknown }> {
    return this.request<{ card: unknown }>(
      `/catalog/cards/${encodeURIComponent(String(catalogCardId))}/metadata`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }
}

export const api = new ApiClient();
