import type { TCGTrackingSet, TCGTrackingPrice, TCGTrackingPriceResponse } from './types';

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

      const data = await response.json();

      // Validate response shape
      if (!Array.isArray(data)) {
        console.warn('TCGTracking getSets returned unexpected format (not an array)');
        return [];
      }

      return data as TCGTrackingSet[];
    } catch (error) {
      console.error('Error fetching sets from TCGTracking:', error);
      return [];
    }
  }

  async getPricing(setSlug: string): Promise<TCGTrackingPrice[]> {
    const url = `${this.baseUrl}/${RIFTBOUND_CATEGORY_ID}/sets/${setSlug}/pricing`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`TCGTracking API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();

      // Validate response shape - expecting { prices: [...] }
      if (!data || typeof data !== 'object' || !Array.isArray(data.prices)) {
        console.warn('TCGTracking getPricing returned unexpected format (missing prices array)');
        return [];
      }

      return (data as TCGTrackingPriceResponse).prices;
    } catch (error) {
      console.error(`Error fetching pricing for set ${setSlug} from TCGTracking:`, error);
      return [];
    }
  }
}
