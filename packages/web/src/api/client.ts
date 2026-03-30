import type {
  Card,
  CardStats,
  GetCardsParams,
  GetCardsResponse,
  ImportResult,
  RepriceAllResult,
  FetchPricesResult,
} from './types';

const API_BASE = '/api';

class ApiClient {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
    // Only set Content-Type for requests with a body
    if (options?.body) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getCards(params?: GetCardsParams): Promise<GetCardsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);

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
      const error = await response.json().catch(() => ({ error: 'Import failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
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

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }
}

export const api = new ApiClient();
