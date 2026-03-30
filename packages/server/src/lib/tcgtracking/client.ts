import type { TCGTrackingSet, TCGTrackingSetsResponse, TCGTrackingPriceResponse } from './types';

const DEFAULT_BASE_URL = 'https://tcgtracking.com/tcgapi/v1';
const RIFTBOUND_CATEGORY_ID = 89;

export class TCGTrackingClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.TCGTRACKING_BASE_URL || DEFAULT_BASE_URL;
  }

  async getSets(): Promise<TCGTrackingSet[]> {
    const url = `${this.baseUrl}/${RIFTBOUND_CATEGORY_ID}/sets`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`TCGTracking API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as TCGTrackingSetsResponse;

      // Validate response shape
      if (!data.sets || !Array.isArray(data.sets)) {
        console.warn('TCGTracking getSets returned unexpected format (missing sets array)');
        return [];
      }

      return data.sets;
    } catch (error) {
      console.error('Error fetching sets from TCGTracking:', error);
      return [];
    }
  }

  async getPricing(setId: number): Promise<TCGTrackingPriceResponse | null> {
    const url = `${this.baseUrl}/${RIFTBOUND_CATEGORY_ID}/sets/${setId}/pricing`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`TCGTracking API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as TCGTrackingPriceResponse;

      // Validate response shape - expecting { set_id, updated, prices: {...} }
      if (!data || typeof data !== 'object' || !data.prices) {
        console.warn('TCGTracking getPricing returned unexpected format (missing prices object)');
        return null;
      }

      return data;
    } catch (error) {
      console.error(`Error fetching pricing for set ${setId} from TCGTracking:`, error);
      return null;
    }
  }
}
