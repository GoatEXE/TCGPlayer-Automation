import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import {
  cards,
  isListedOriginAttentionReason,
  type Card,
} from '../../db/schema/cards.js';
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
import {
  getRuntimeListedPriceAttentionMinDiffCents,
  getRuntimeListedPriceAttentionThresholdPercent,
} from './settings.js';

export type PriceCheckSource = 'manual' | 'scheduled';

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
  historyId: number;
  source: PriceCheckSource;
  displayName: string;
  productName: string;
  title: string | null;
  setName: string | null;
  condition: string;
  attentionReason: Card['attentionReason'];
  previousStatus: Card['status'];
  newStatus: Card['status'];
  previousMarketPrice: number | null;
  newMarketPrice: number | null;
  currentListingPrice: number | null;
  recommendedListingPrice: number | null;
  driftPercent: number | null;
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

function extractProductIdFromPhotoUrl(
  photoUrl: string | null | undefined,
): number | null {
  if (!photoUrl) return null;
  const match = photoUrl.match(/\/product\/(\d+)/);
  if (!match) return null;

  const productId = Number.parseInt(match[1], 10);
  return Number.isNaN(productId) ? null : productId;
}

function isLegacyMisalignedCollectionImport(card: Card): boolean {
  const hasNumericProductLine = /^\d+$/.test(card.productLine);
  const hasMisplacedProductLine =
    card.setName === 'Riftbound: League of Legends Trading Card Game';
  const hasShiftedCardName = card.title !== null && card.number === null;
  const hasCollectorNumberInRarity =
    card.rarity !== null && /^\d+\/\d+$/.test(card.rarity);
  const hasPrintingInCondition = /^(Normal|Foil)$/i.test(card.condition);
  const hasQuantityInPhotoUrl =
    card.photoUrl !== null && /^\d+$/.test(card.photoUrl);

  return (
    card.tcgProductId === null &&
    hasNumericProductLine &&
    hasMisplacedProductLine &&
    hasShiftedCardName &&
    hasCollectorNumberInRarity &&
    hasPrintingInCondition &&
    hasQuantityInPhotoUrl
  );
}

function resolveProductId(
  card: Card,
  pricingByProductId: Map<string, TCGTrackingProductPrice>,
): number | null {
  if (card.tcgProductId != null) {
    return card.tcgProductId;
  }

  const productIdFromPhotoUrl = extractProductIdFromPhotoUrl(card.photoUrl);
  if (productIdFromPhotoUrl != null) {
    return productIdFromPhotoUrl;
  }

  if (
    isLegacyMisalignedCollectionImport(card) &&
    card.tcgplayerId != null &&
    pricingByProductId.has(card.tcgplayerId.toString())
  ) {
    return card.tcgplayerId;
  }

  return null;
}

function calculateAbsolutePriceDiffCents(
  previousListingPrice: number | null,
  newListingPrice: number | null,
): number | null {
  if (previousListingPrice === null || newListingPrice === null) {
    return null;
  }

  return Math.abs(
    Math.round(previousListingPrice * 100) - Math.round(newListingPrice * 100),
  );
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

function isListedLikeCard(card: Pick<Card, 'status' | 'attentionReason'>) {
  return (
    card.status === 'listed' ||
    (card.status === 'needs_attention' &&
      isListedOriginAttentionReason(card.attentionReason))
  );
}

function getListedAttentionReason(params: {
  isThresholdDrift: boolean;
  pricingStatus: ReturnType<typeof calculatePrice>['status'];
  recommendedListingPrice: number | null;
  previousListingPrice: number | null;
}): Card['attentionReason'] {
  const {
    isThresholdDrift,
    pricingStatus,
    recommendedListingPrice,
    previousListingPrice,
  } = params;

  if (isThresholdDrift) {
    return 'listed_price_drift';
  }

  if (pricingStatus !== 'matched' || recommendedListingPrice === null) {
    return 'listed_below_threshold';
  }

  if (previousListingPrice === null) {
    return 'listed_price_drift';
  }

  return null;
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
    previousStatus !== 'matched' &&
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

function buildNeedsAttentionCardAlert(params: {
  card: Pick<
    Card,
    'id' | 'productName' | 'title' | 'setName' | 'condition'
  >;
  historyId: number;
  source: PriceCheckSource;
  attentionReason: Card['attentionReason'];
  previousStatus: Card['status'];
  newStatus: Card['status'];
  previousMarketPrice: number | null;
  newMarketPrice: number | null;
  currentListingPrice: number | null;
  recommendedListingPrice: number | null;
  driftPercent: number | null;
}): NeedsAttentionCardAlert {
  const { card } = params;

  return {
    cardId: card.id,
    historyId: params.historyId,
    source: params.source,
    displayName: card.title?.trim() || card.productName,
    productName: card.productName,
    title: card.title,
    setName: card.setName,
    condition: card.condition,
    attentionReason: params.attentionReason,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    previousMarketPrice: params.previousMarketPrice,
    newMarketPrice: params.newMarketPrice,
    currentListingPrice: params.currentListingPrice,
    recommendedListingPrice: params.recommendedListingPrice,
    driftPercent: params.driftPercent,
  };
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
    const resolvedProductId = resolveProductId(card, pricingByProductId);

    if (!resolvedProductId) {
      continue;
    }

    const productPricing = pricingByProductId.get(resolvedProductId.toString());
    if (!productPricing) {
      notFound++;

      const previousMarketPrice = parseDecimal(card.marketPrice);
      const previousListingPrice = parseDecimal(card.listingPrice);
      const previousStatus = card.status;
      const wasListedLike = isListedLikeCard(card);
      const persistedListedListingPrice = wasListedLike
        ? card.listingPrice
        : null;
      const historyListingPrice = wasListedLike ? previousListingPrice : null;

      await db
        .update(cards)
        .set({
          tcgProductId: resolvedProductId,
          marketPrice: null,
          listingPrice: persistedListedListingPrice,
          status: 'needs_attention',
          attentionReason: wasListedLike ? 'listed_missing_price' : null,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id));

      const historyId = await insertPriceHistoryEntry({
        cardId: card.id,
        source,
        previousMarketPrice: previousMarketPrice?.toString() ?? null,
        newMarketPrice: null,
        previousListingPrice: previousListingPrice?.toString() ?? null,
        newListingPrice: historyListingPrice?.toString() ?? null,
        adjustedToPrice: null,
        previousStatus,
        newStatus: 'needs_attention',
        driftPercent: null,
        notificationSent: false,
        checkedAt: new Date(),
      });

      needsAttentionCards.push(
        buildNeedsAttentionCardAlert({
          card,
          historyId,
          source,
          attentionReason: wasListedLike ? 'listed_missing_price' : null,
          previousStatus,
          newStatus: 'needs_attention',
          previousMarketPrice,
          newMarketPrice: null,
          currentListingPrice: historyListingPrice,
          recommendedListingPrice: null,
          driftPercent: null,
        }),
      );
      needsAttentionHistoryIds.push(historyId);

      const csvDiffAction = getCsvDiffAction({
        previousStatus,
        newStatus: 'needs_attention',
        previousListingPrice,
        newListingPrice: historyListingPrice,
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
          newListingPrice: historyListingPrice,
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
      const wasListedLike = isListedLikeCard(card);
      const persistedListedListingPrice = wasListedLike
        ? card.listingPrice
        : null;
      const historyListingPrice = wasListedLike ? previousListingPrice : null;

      await db
        .update(cards)
        .set({
          tcgProductId: resolvedProductId,
          marketPrice: null,
          listingPrice: persistedListedListingPrice,
          status: 'needs_attention',
          attentionReason: wasListedLike ? 'listed_missing_price' : null,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id));

      const historyId = await insertPriceHistoryEntry({
        cardId: card.id,
        source,
        previousMarketPrice: previousMarketPrice?.toString() ?? null,
        newMarketPrice: null,
        previousListingPrice: previousListingPrice?.toString() ?? null,
        newListingPrice: historyListingPrice?.toString() ?? null,
        adjustedToPrice: null,
        previousStatus,
        newStatus: 'needs_attention',
        driftPercent: null,
        notificationSent: false,
        checkedAt: new Date(),
      });

      needsAttentionCards.push(
        buildNeedsAttentionCardAlert({
          card,
          historyId,
          source,
          attentionReason: wasListedLike ? 'listed_missing_price' : null,
          previousStatus,
          newStatus: 'needs_attention',
          previousMarketPrice,
          newMarketPrice: null,
          currentListingPrice: historyListingPrice,
          recommendedListingPrice: null,
          driftPercent: null,
        }),
      );
      needsAttentionHistoryIds.push(historyId);

      const csvDiffAction = getCsvDiffAction({
        previousStatus,
        newStatus: 'needs_attention',
        previousListingPrice,
        newListingPrice: historyListingPrice,
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
          newListingPrice: historyListingPrice,
          driftPercent: null,
        });
      }

      continue;
    }

    const previousMarketPrice = parseDecimal(card.marketPrice);
    const previousListingPrice = parseDecimal(card.listingPrice);
    const previousStatus = card.status;
    const wasListedLike = isListedLikeCard(card);

    const newMarketPrice = conditionPricing.market;
    const pricingResult = calculatePrice({ marketPrice: newMarketPrice });

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

    const recommendedListingPrice = applyFloorPriceCents({
      listingPrice: pricingResult.listingPrice ?? null,
      floorPriceCents: card.floorPriceCents,
    });
    const cappedListingPrice = wasListedLike
      ? recommendedListingPrice
      : capDownwardListingPriceChange({
          previousListingPrice,
          nextListingPrice: recommendedListingPrice,
          maxPriceDropPercent: env.MAX_PRICE_DROP_PERCENT,
        });
    const recommendedDriftPercent = calculateDriftPercent(
      previousListingPrice,
      recommendedListingPrice,
    );
    const absolutePriceDiffCents = calculateAbsolutePriceDiffCents(
      previousListingPrice,
      recommendedListingPrice,
    );
    const isThresholdDrift =
      wasListedLike &&
      recommendedDriftPercent !== null &&
      absolutePriceDiffCents !== null &&
      Math.abs(recommendedDriftPercent) >=
        getRuntimeListedPriceAttentionThresholdPercent() &&
      absolutePriceDiffCents >= getRuntimeListedPriceAttentionMinDiffCents();

    const listedNeedsAttention =
      wasListedLike &&
      (pricingResult.status !== 'matched' ||
        recommendedListingPrice === null ||
        previousListingPrice === null ||
        isThresholdDrift);

    const newStatus = wasListedLike
      ? listedNeedsAttention
        ? 'needs_attention'
        : 'listed'
      : pricingResult.status;
    const newListingPrice = wasListedLike
      ? previousListingPrice
      : cappedListingPrice;
    const persistedListingPrice = wasListedLike
      ? card.listingPrice
      : newListingPrice?.toString() ?? null;
    const attentionReason =
      newStatus === 'needs_attention' && wasListedLike
        ? getListedAttentionReason({
            isThresholdDrift,
            pricingStatus: pricingResult.status,
            recommendedListingPrice,
            previousListingPrice,
          })
        : null;
    const driftPercent = wasListedLike
      ? recommendedDriftPercent
      : calculateDriftPercent(previousListingPrice, newListingPrice);

    if (isThresholdDrift) {
      drifted++;

      if (
        previousListingPrice !== null &&
        recommendedListingPrice !== null &&
        recommendedDriftPercent !== null
      ) {
        driftedCards.push({
          cardId: card.id,
          productName: card.productName,
          previousListingPrice,
          newListingPrice: recommendedListingPrice,
          driftPercent: recommendedDriftPercent,
        });
      }
    }

    await db
      .update(cards)
      .set({
        tcgProductId: resolvedProductId,
        marketPrice: newMarketPrice.toString(),
        listingPrice: persistedListingPrice,
        status: newStatus,
        attentionReason,
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

    const adjustedToPrice = isThresholdDrift ? recommendedListingPrice : null;

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

    if (newStatus === 'needs_attention') {
      needsAttentionCards.push(
        buildNeedsAttentionCardAlert({
          card,
          historyId,
          source,
          attentionReason,
          previousStatus,
          newStatus,
          previousMarketPrice,
          newMarketPrice,
          currentListingPrice: newListingPrice,
          recommendedListingPrice,
          driftPercent,
        }),
      );
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
