import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { cards } from '../../db/schema/cards.js';
import {
  priceHistory,
  type NewPriceHistory,
} from '../../db/schema/price-history.js';
import { applyFloorPriceCents, calculatePrice } from '../pricing/index.js';
import {
  buildPriceCheckCsvDiff,
  type PriceCheckCsvDiff,
  type PriceCheckCsvDiffAction,
  type PriceCheckCsvDiffRow,
} from './csv-diff.js';
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

export interface NeedsAttentionCardAlert {
  cardId: number;
  productName: string;
}

export interface RunPriceCheckResult {
  updated: number;
  notFound: number;
  drifted: number;
  driftedCards: DriftedCardChange[];
  driftedHistoryIds: number[];
  needsAttentionCards: NeedsAttentionCardAlert[];
  needsAttentionHistoryIds: number[];
  csvDiff: PriceCheckCsvDiff;
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

function hasListingPriceChanged(
  previousListingPrice: number | null,
  newListingPrice: number | null,
): boolean {
  if (previousListingPrice === null || newListingPrice === null) {
    return previousListingPrice !== newListingPrice;
  }

  return previousListingPrice !== newListingPrice;
}

function getCsvDiffAction(params: {
  previousStatus: PriceCheckCsvDiffRow['previousStatus'];
  newStatus: PriceCheckCsvDiffRow['newStatus'];
  previousListingPrice: number | null;
  newListingPrice: number | null;
  isThresholdDrift: boolean;
}): PriceCheckCsvDiffAction | null {
  const {
    previousStatus,
    newStatus,
    previousListingPrice,
    newListingPrice,
    isThresholdDrift,
  } = params;

  if (previousStatus === 'listed' && newStatus !== 'listed') {
    return 'remove_listing';
  }

  if (
    previousStatus !== 'listed' &&
    newStatus === 'matched' &&
    newListingPrice !== null
  ) {
    return 'add_listing';
  }

  if (
    previousStatus === 'listed' &&
    newStatus === 'listed' &&
    hasListingPriceChanged(previousListingPrice, newListingPrice) &&
    isThresholdDrift
  ) {
    return 'price_change';
  }

  return null;
}

async function insertPriceHistoryEntry(
  values: NewPriceHistory,
): Promise<number> {
  const [insertedHistory] = await db
    .insert(priceHistory)
    .values(values)
    .returning({ id: priceHistory.id });

  return insertedHistory.id;
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
  const driftedHistoryIds: number[] = [];
  const needsAttentionCards: NeedsAttentionCardAlert[] = [];
  const needsAttentionHistoryIds: number[] = [];
  const csvDiffRows: PriceCheckCsvDiffRow[] = [];

  for (const card of allCards) {
    if (!card.tcgProductId) {
      continue;
    }

    const productPricing = pricingByProductId.get(card.tcgProductId.toString());
    if (!productPricing) {
      notFound++;

      const previousMarketPrice = parseDecimal(card.marketPrice);
      const previousListingPrice = parseDecimal(card.listingPrice);
      const previousStatus = card.status;

      await db
        .update(cards)
        .set({
          marketPrice: null,
          listingPrice: null,
          status: 'needs_attention',
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id));

      const historyId = await insertPriceHistoryEntry({
        cardId: card.id,
        source,
        previousMarketPrice: previousMarketPrice?.toString() ?? null,
        newMarketPrice: null,
        previousListingPrice: previousListingPrice?.toString() ?? null,
        newListingPrice: null,
        adjustedToPrice: null,
        previousStatus,
        newStatus: 'needs_attention',
        driftPercent: null,
        notificationSent: false,
        checkedAt: new Date(),
      });

      if (previousStatus !== 'needs_attention') {
        needsAttentionCards.push({
          cardId: card.id,
          productName: card.productName,
        });
        needsAttentionHistoryIds.push(historyId);
      }

      const csvDiffAction = getCsvDiffAction({
        previousStatus,
        newStatus: 'needs_attention',
        previousListingPrice,
        newListingPrice: null,
        isThresholdDrift: false,
      });

      if (csvDiffAction) {
        csvDiffRows.push({
          action: csvDiffAction,
          cardId: card.id,
          productName: card.productName,
          previousStatus,
          newStatus: 'needs_attention',
          previousListingPrice,
          newListingPrice: null,
          driftPercent: null,
        });
      }

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

      const previousMarketPrice = parseDecimal(card.marketPrice);
      const previousListingPrice = parseDecimal(card.listingPrice);
      const previousStatus = card.status;

      await db
        .update(cards)
        .set({
          marketPrice: null,
          listingPrice: null,
          status: 'needs_attention',
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id));

      const historyId = await insertPriceHistoryEntry({
        cardId: card.id,
        source,
        previousMarketPrice: previousMarketPrice?.toString() ?? null,
        newMarketPrice: null,
        previousListingPrice: previousListingPrice?.toString() ?? null,
        newListingPrice: null,
        adjustedToPrice: null,
        previousStatus,
        newStatus: 'needs_attention',
        driftPercent: null,
        notificationSent: false,
        checkedAt: new Date(),
      });

      if (previousStatus !== 'needs_attention') {
        needsAttentionCards.push({
          cardId: card.id,
          productName: card.productName,
        });
        needsAttentionHistoryIds.push(historyId);
      }

      const csvDiffAction = getCsvDiffAction({
        previousStatus,
        newStatus: 'needs_attention',
        previousListingPrice,
        newListingPrice: null,
        isThresholdDrift: false,
      });

      if (csvDiffAction) {
        csvDiffRows.push({
          action: csvDiffAction,
          cardId: card.id,
          productName: card.productName,
          previousStatus,
          newStatus: 'needs_attention',
          previousListingPrice,
          newListingPrice: null,
          driftPercent: null,
        });
      }

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

    const flooredListingPrice = applyFloorPriceCents({
      listingPrice: pricingResult.listingPrice ?? null,
      floorPriceCents: card.floorPriceCents,
    });

    const newListingPrice = capDownwardListingPriceChange({
      previousListingPrice,
      nextListingPrice: flooredListingPrice,
      maxPriceDropPercent: env.MAX_PRICE_DROP_PERCENT,
    });
    const driftPercent = calculateDriftPercent(
      previousListingPrice,
      newListingPrice,
    );
    const isThresholdDrift =
      driftPercent !== null &&
      Math.abs(driftPercent) >= env.PRICE_DRIFT_THRESHOLD_PERCENT;

    if (isThresholdDrift) {
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

    const csvDiffAction = getCsvDiffAction({
      previousStatus,
      newStatus,
      previousListingPrice,
      newListingPrice,
      isThresholdDrift,
    });

    const adjustedToPrice =
      csvDiffAction === 'price_change' ? newListingPrice : null;

    const historyId = await insertPriceHistoryEntry({
      cardId: card.id,
      source,
      previousMarketPrice: previousMarketPrice?.toString() ?? null,
      newMarketPrice: newMarketPrice.toString(),
      previousListingPrice: previousListingPrice?.toString() ?? null,
      newListingPrice: newListingPrice?.toString() ?? null,
      adjustedToPrice: adjustedToPrice?.toString() ?? null,
      previousStatus,
      newStatus,
      driftPercent: driftPercent?.toString() ?? null,
      notificationSent: false,
      checkedAt: new Date(),
    });

    if (isThresholdDrift) {
      driftedHistoryIds.push(historyId);
    }

    if (csvDiffAction) {
      csvDiffRows.push({
        action: csvDiffAction,
        cardId: card.id,
        productName: card.productName,
        previousStatus,
        newStatus,
        previousListingPrice,
        newListingPrice,
        driftPercent,
      });
    }

    if (
      previousStatus !== 'needs_attention' &&
      newStatus === 'needs_attention'
    ) {
      needsAttentionCards.push({
        cardId: card.id,
        productName: card.productName,
      });
      needsAttentionHistoryIds.push(historyId);
    }

    updated++;
  }

  return {
    updated,
    notFound,
    drifted,
    driftedCards,
    driftedHistoryIds,
    needsAttentionCards,
    needsAttentionHistoryIds,
    csvDiff: buildPriceCheckCsvDiff(csvDiffRows),
    errors,
  };
}
