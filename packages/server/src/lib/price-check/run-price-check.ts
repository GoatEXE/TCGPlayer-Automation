import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { cards } from '../../db/schema/cards.js';
import { priceHistory } from '../../db/schema/price-history.js';
import { calculatePrice } from '../pricing/index.js';
import { capDownwardListingPriceChange } from './max-price-drop-safeguard.js';
import { TCGTrackingClient } from '../tcgtracking/client.js';
import type { TCGTrackingProductPrice } from '../tcgtracking/types.js';

type PriceCheckSource = 'manual' | 'scheduled';

export interface RunPriceCheckOptions {
  source?: PriceCheckSource;
}

export interface DriftedCardChange {
  cardId: number;
  productName: string;
  previousListingPrice: number;
  newListingPrice: number;
  driftPercent: number;
}

export interface RunPriceCheckResult {
  updated: number;
  notFound: number;
  drifted: number;
  driftedCards: DriftedCardChange[];
  errors: string[];
}

function parseDecimal(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function calculateDriftPercent(
  previousListingPrice: number | null,
  newListingPrice: number | null,
): number | null {
  if (
    previousListingPrice === null ||
    newListingPrice === null ||
    previousListingPrice <= 0
  ) {
    return null;
  }

  const drift =
    ((newListingPrice - previousListingPrice) / previousListingPrice) * 100;

  return Number(drift.toFixed(2));
}

export async function runPriceCheck(
  options: RunPriceCheckOptions = {},
): Promise<RunPriceCheckResult> {
  const source = options.source ?? 'manual';
  const client = new TCGTrackingClient();

  const sets = await client.getSets();
  if (sets.length === 0) {
    throw new Error('Failed to fetch sets from TCGTracking');
  }

  const allCards = await db.select().from(cards);
  const pricingByProductId = new Map<string, TCGTrackingProductPrice>();

  const errors: string[] = [];

  for (const set of sets) {
    try {
      const pricingData = await client.getPricing(set.id);

      if (!pricingData?.prices) {
        continue;
      }

      for (const [productId, productPricing] of Object.entries(
        pricingData.prices,
      )) {
        if (!pricingByProductId.has(productId)) {
          pricingByProductId.set(productId, productPricing);
        }
      }
    } catch (error) {
      errors.push(`Error fetching pricing for set ${set.name}: ${error}`);
    }
  }

  const foilNoteLine = 'Price from Foil (no Normal pricing available)';
  let updated = 0;
  let notFound = 0;
  let drifted = 0;
  const driftedCards: DriftedCardChange[] = [];

  for (const card of allCards) {
    if (!card.tcgProductId) {
      continue;
    }

    const productPricing = pricingByProductId.get(card.tcgProductId.toString());
    if (!productPricing) {
      notFound++;
      continue;
    }

    let conditionKey = 'Normal';
    if (card.condition.toLowerCase().includes('foil')) {
      conditionKey = 'Foil';
    }

    let conditionPricing = productPricing.tcg?.[conditionKey];
    let isFoilFallback = false;

    if (
      (!conditionPricing || !conditionPricing.market) &&
      conditionKey === 'Normal'
    ) {
      const foilPricing = productPricing.tcg?.Foil;
      if (foilPricing?.market) {
        conditionPricing = foilPricing;
        isFoilFallback = true;
      }
    }

    if (!conditionPricing?.market) {
      notFound++;
      continue;
    }

    const previousMarketPrice = parseDecimal(card.marketPrice);
    const previousListingPrice = parseDecimal(card.listingPrice);
    const previousStatus = card.status;

    const newMarketPrice = conditionPricing.market;
    const pricingResult = calculatePrice({ marketPrice: newMarketPrice });

    const newStatus =
      card.status === 'listed' && pricingResult.status === 'matched'
        ? 'listed'
        : pricingResult.status;

    let notesValue = card.notes || '';
    if (isFoilFallback) {
      if (!notesValue.includes(foilNoteLine)) {
        notesValue = notesValue
          ? `${notesValue}\n${foilNoteLine}`
          : foilNoteLine;
      }
    } else {
      notesValue = notesValue
        .split('\n')
        .filter((line) => line !== foilNoteLine)
        .join('\n');
    }

    const newListingPrice = capDownwardListingPriceChange({
      previousListingPrice,
      nextListingPrice: pricingResult.listingPrice ?? null,
      maxPriceDropPercent: env.MAX_PRICE_DROP_PERCENT,
    });
    const driftPercent = calculateDriftPercent(
      previousListingPrice,
      newListingPrice,
    );

    if (
      driftPercent !== null &&
      Math.abs(driftPercent) >= env.PRICE_DRIFT_THRESHOLD_PERCENT
    ) {
      drifted++;
      if (previousListingPrice !== null && newListingPrice !== null) {
        driftedCards.push({
          cardId: card.id,
          productName: card.productName,
          previousListingPrice,
          newListingPrice,
          driftPercent,
        });
      }
    }

    await db
      .update(cards)
      .set({
        marketPrice: newMarketPrice.toString(),
        listingPrice: newListingPrice?.toString() ?? null,
        status: newStatus,
        isFoilPrice: isFoilFallback,
        notes: notesValue || null,
        updatedAt: new Date(),
      })
      .where(eq(cards.id, card.id));

    await db.insert(priceHistory).values({
      cardId: card.id,
      source,
      previousMarketPrice: previousMarketPrice?.toString() ?? null,
      newMarketPrice: newMarketPrice.toString(),
      previousListingPrice: previousListingPrice?.toString() ?? null,
      newListingPrice: newListingPrice?.toString() ?? null,
      previousStatus,
      newStatus,
      driftPercent: driftPercent?.toString() ?? null,
      notificationSent: false,
      checkedAt: new Date(),
    });

    updated++;
  }

  return {
    updated,
    notFound,
    drifted,
    driftedCards,
    errors,
  };
}
