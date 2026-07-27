import type { NewCatalogCard } from '../../db/schema/catalog.js';
import type { TCGTrackingProduct } from '../tcgtracking/types.js';
import { CARD_KINDS, type CardKind } from '../collections/sellability.js';
import { normalizeCollectorNumber } from './normalize.js';

function getString(product: TCGTrackingProduct, keys: string[]): string | null {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function getNumber(product: TCGTrackingProduct, keys: string[]): number | null {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }
  }

  return null;
}

function getCardKind(product: TCGTrackingProduct): CardKind | null {
  const rawKind = getString(product, ['card_kind', 'kind', 'card_type', 'type']);
  const normalizedKind = rawKind?.trim().toLowerCase();

  if (normalizedKind && (CARD_KINDS as readonly string[]).includes(normalizedKind)) {
    return normalizedKind as CardKind;
  }

  return null;
}

export function mapTCGTrackingProductToCatalogCard(
  catalogSetId: number,
  product: TCGTrackingProduct,
): NewCatalogCard | null {
  const productName = getString(product, ['product_name', 'name', 'title']);

  if (!productName) {
    return null;
  }

  const collectorNumber = getString(product, [
    'collector_number',
    'card_number',
    'number',
  ]);

  return {
    catalogSetId,
    tcgProductId: getNumber(product, [
      'tcg_product_id',
      'tcgplayer_id',
      'product_id',
      'id',
    ]),
    productName,
    title: getString(product, ['title']),
    collectorNumber,
    normalizedNumber: collectorNumber
      ? normalizeCollectorNumber(collectorNumber)
      : null,
    rarity: getString(product, ['rarity']),
    photoUrl: getString(product, ['photo_url', 'image_url', 'url']),
    cardKind: getCardKind(product),
    raw: product,
    syncedAt: new Date(),
    updatedAt: new Date(),
  };
}
