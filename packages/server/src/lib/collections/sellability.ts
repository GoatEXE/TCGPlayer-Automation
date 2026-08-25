import {
  RIFTBOUND_CARD_KIND_BY_SET_NUMBER,
  RIFTBOUND_CARD_KIND_BY_TCG_PRODUCT_ID,
} from './riftbound-card-kinds.js';

export const CARD_KINDS = [
  'normal',
  'legend',
  'battlefield',
  'rune',
  'token',
  'unknown',
] as const;

export type CardKind = (typeof CARD_KINDS)[number];
export type FinishKind = 'normal' | 'foil';
export type SellabilityOpportunityType = 'foil_swap' | 'over_cap' | null;

export interface SellabilityCatalogCardInput {
  catalogCardId: number;
  tcgProductId?: number | null;
  productName: string;
  title?: string | null;
  collectorNumber?: string | null;
  normalizedNumber?: string | null;
  rarity?: string | null;
  photoUrl?: string | null;
  cardKind?: string | null;
  raw?: unknown;
  set?: {
    id?: number | null;
    setCode?: string | null;
    name?: string | null;
  };
}

export interface SellabilityCollectionItemInput
  extends SellabilityCatalogCardInput {
  collectionItemId?: number | null;
  quantity: number;
  finish?: string | null;
  condition?: string | null;
  language?: string | null;
}

export interface ClassifiedCard extends SellabilityCatalogCardInput {
  kind: CardKind;
  kindSource: 'explicit' | 'detected' | 'unknown';
  cardKindSource: 'metadata' | 'inferred' | 'unknown';
  needsClassification: boolean;
}

export interface SellabilitySourceItem {
  collectionItemId: number | null;
  finish: string;
  finishKind: FinishKind;
  condition: string;
  language: string;
  quantity: number;
  recommendedSellQuantity: number;
}

export interface SellabilityRow {
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
  kindSource: ClassifiedCard['kindSource'];
  cardKindSource: ClassifiedCard['cardKindSource'];
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
  opportunityType: SellabilityOpportunityType;
  keepTargetSatisfiedByNormal: boolean;
  sourceItems: SellabilitySourceItem[];
  transferItems: SellabilitySourceItem[];
}

const VALID_CARD_KINDS = new Set<string>(CARD_KINDS);
export const DEFAULT_KEEP_COLLECTION_NAME = 'Default';
export const DEFAULT_SELL_COLLECTION_NAME = 'To Be Sold';
export const DEFAULT_CONDITION = 'Near Mint';
export const DEFAULT_FINISH = 'Normal';
export const DEFAULT_LANGUAGE = 'EN';

export function normalizeFinishKind(finish: string | null | undefined): FinishKind {
  const normalized = (finish || DEFAULT_FINISH).trim().toLowerCase();
  return normalized.includes('foil') || normalized.includes('shiny')
    ? 'foil'
    : 'normal';
}

function normalizedText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function normalizeCollectorNumberForClassification(
  value: string | null | undefined,
): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

interface ParsedCollectorNumber {
  number: number;
  total: number | null;
}

function parseCollectorNumber(value: string): ParsedCollectorNumber | null {
  const match = value.match(/^(\d+)[A-Z*]*\/?(?:(\d+)[A-Z]*)?$/);
  if (!match) {
    return null;
  }

  const number = Number.parseInt(match[1], 10);
  const total = match[2] ? Number.parseInt(match[2], 10) : null;

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return { number, total: total && Number.isFinite(total) ? total : null };
}

function isTokenNumber(value: string): boolean {
  return /^T\d{2,3}$/.test(value) || /^T\d{2,3}\/\/T\d{2,3}$/.test(value);
}

function isRuneNumber(value: string): boolean {
  return /^R\d{2,3}[A-Z]?$/.test(value);
}

function cardKindFromTypeValue(value: string): CardKind | null {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue.includes('token')) {
    return 'token';
  }
  if (normalizedValue.includes('rune')) {
    return 'rune';
  }
  if (normalizedValue.includes('legend')) {
    return 'legend';
  }
  if (normalizedValue.includes('battlefield')) {
    return 'battlefield';
  }
  if (VALID_CARD_KINDS.has(normalizedValue)) {
    return normalizedValue as CardKind;
  }

  return null;
}

function structuredRawKind(raw: unknown): CardKind | null {
  const seen = new Set<unknown>();
  const stack = [raw];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    const maybeExtendedData = current as { name?: unknown; displayName?: unknown; value?: unknown };
    const extendedDataName =
      typeof maybeExtendedData.name === 'string'
        ? maybeExtendedData.name
        : typeof maybeExtendedData.displayName === 'string'
          ? maybeExtendedData.displayName
          : null;
    if (
      extendedDataName?.trim().toLowerCase().replace(/[^a-z0-9]/g, '') ===
        'cardtype' &&
      typeof maybeExtendedData.value === 'string'
    ) {
      const kind = cardKindFromTypeValue(maybeExtendedData.value);
      if (kind) {
        return kind;
      }
    }

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (value && typeof value === 'object') {
        stack.push(value);
      }

      if (typeof value !== 'string') {
        continue;
      }

      if (
        [
          'cardkind',
          'kind',
          'cardtype',
          'type',
          'subtype',
          'supertype',
          'classification',
        ].includes(normalizedKey)
      ) {
        const kind = cardKindFromTypeValue(value);
        if (kind) {
          return kind;
        }
      }
    }
  }

  return null;
}

function curatedCardKind(
  card: SellabilityCatalogCardInput,
  normalizedNumber: string,
): CardKind | null {
  if (typeof card.tcgProductId === 'number') {
    const productKind = RIFTBOUND_CARD_KIND_BY_TCG_PRODUCT_ID[card.tcgProductId];
    if (productKind) {
      return productKind;
    }
  }

  const setCode = card.set?.setCode?.trim().toUpperCase();
  if (setCode) {
    const setNumberKind =
      RIFTBOUND_CARD_KIND_BY_SET_NUMBER[`${setCode}:${normalizedNumber}`];
    if (setNumberKind) {
      return setNumberKind;
    }
  }

  return null;
}

function inferredCardKind(card: SellabilityCatalogCardInput): CardKind | null {
  const normalizedNumber = normalizeCollectorNumberForClassification(
    card.normalizedNumber || card.collectorNumber,
  );
  const parsedNumber = parseCollectorNumber(normalizedNumber);
  const rawKind = structuredRawKind(card.raw);
  const curatedKind = curatedCardKind(card, normalizedNumber);

  const name = normalizedText(`${card.productName} ${card.title || ''}`);

  if (rawKind) {
    return rawKind;
  }
  if (curatedKind) {
    return curatedKind;
  }
  if (isTokenNumber(normalizedNumber) || (!parsedNumber?.total && /\btoken\b/.test(name))) {
    return 'token';
  }
  if (isRuneNumber(normalizedNumber) || (!parsedNumber?.total && /\brune\b/.test(name))) {
    return 'rune';
  }
  if (parsedNumber?.total) {
    return 'normal';
  }

  return null;
}

export function classifyCatalogCard(
  card: SellabilityCatalogCardInput,
): ClassifiedCard {
  const explicit = normalizedText(card.cardKind);
  if (VALID_CARD_KINDS.has(explicit)) {
    const kind = explicit as CardKind;
    return {
      ...card,
      kind,
      kindSource: 'explicit',
      cardKindSource: 'metadata',
      needsClassification: kind === 'unknown',
    };
  }

  const inferred = inferredCardKind(card);
  if (inferred) {
    return {
      ...card,
      kind: inferred,
      kindSource: 'detected',
      cardKindSource: 'inferred',
      needsClassification: false,
    };
  }

  return {
    ...card,
    kind: 'unknown',
    kindSource: 'unknown',
    cardKindSource: 'unknown',
    needsClassification: true,
  };
}

export function getKeepTarget(kind: CardKind): number | null {
  switch (kind) {
    case 'normal':
      return 3;
    case 'legend':
    case 'battlefield':
      return 1;
    case 'rune':
    case 'token':
    case 'unknown':
      return null;
  }
}

function cardIdentity(card: SellabilityCatalogCardInput) {
  return {
    catalogCardId: card.catalogCardId,
    tcgProductId: card.tcgProductId ?? null,
    productName: card.productName,
    title: card.title ?? null,
    setCode: card.set?.setCode ?? null,
    setName: card.set?.name ?? null,
    collectorNumber: card.collectorNumber ?? null,
    normalizedNumber: card.normalizedNumber ?? null,
    rarity: card.rarity ?? null,
    photoUrl: card.photoUrl ?? null,
  };
}

type AllocationFields = Pick<
  SellabilityRow,
  | 'keepTarget'
  | 'keepNormalQty'
  | 'keepFoilQty'
  | 'sellNormalQty'
  | 'sellFoilQty'
  | 'excluded'
  | 'excludedReason'
  | 'needsClassification'
  | 'reasons'
  | 'reasonCodes'
  | 'primaryReasonCode'
  | 'opportunityType'
  | 'keepTargetSatisfiedByNormal'
>;

function computeAllocations(
  kind: CardKind,
  normalQty: number,
  foilQty: number,
): AllocationFields {
  const totalQty = normalQty + foilQty;

  if (kind === 'token' || kind === 'rune') {
    return {
      keepTarget: null,
      keepNormalQty: normalQty,
      keepFoilQty: foilQty,
      sellNormalQty: 0,
      sellFoilQty: 0,
      excluded: true,
      excludedReason: `${kind}_excluded`,
      needsClassification: false,
      reasons: [`${kind}_excluded_from_sellability`],
      reasonCodes: [`${kind}_excluded`],
      primaryReasonCode: `${kind}_excluded`,
      opportunityType: null,
      keepTargetSatisfiedByNormal: false,
    };
  }

  if (kind === 'unknown') {
    return {
      keepTarget: null,
      keepNormalQty: normalQty,
      keepFoilQty: foilQty,
      sellNormalQty: 0,
      sellFoilQty: 0,
      excluded: false,
      excludedReason: null,
      needsClassification: true,
      reasons: ['needs_classification', 'unknown_kind_kept_safe'],
      reasonCodes: ['needs_classification'],
      primaryReasonCode: 'needs_classification',
      opportunityType: null,
      keepTargetSatisfiedByNormal: false,
    };
  }

  const keepTarget = getKeepTarget(kind) ?? totalQty;
  const keepNormalQty = Math.min(normalQty, keepTarget);
  const keepFoilQty = Math.min(foilQty, Math.max(keepTarget - keepNormalQty, 0));
  const sellNormalQty = Math.max(normalQty - keepNormalQty, 0);
  const sellFoilQty = Math.max(foilQty - keepFoilQty, 0);
  const reasons = [
    kind === 'normal' ? 'normal_keep_3' : `${kind}_keep_1`,
  ];
  const reasonCodes = [kind === 'normal' ? 'normal_keep_3' : `${kind}_keep_1`];
  const keepTargetSatisfiedByNormal = normalQty >= keepTarget;
  const isFoilSwap = sellFoilQty > 0 && keepTargetSatisfiedByNormal;

  if (totalQty > keepTarget) {
    reasons.push('over_keep_cap');
    reasonCodes.push('over_keep_cap');
  }
  if (isFoilSwap) {
    reasons.push('foil_preference_sell_foil_first');
    reasonCodes.push('foil_preference');
  }
  if (foilQty > 0 && normalQty < keepTarget && keepFoilQty > 0) {
    reasons.push('insufficient_normals_keep_foil');
    reasonCodes.push('insufficient_normals_keep_foil');
  }

  return {
    keepTarget,
    keepNormalQty,
    keepFoilQty,
    sellNormalQty,
    sellFoilQty,
    excluded: false,
    excludedReason: null,
    needsClassification: false,
    reasons,
    reasonCodes,
    primaryReasonCode: isFoilSwap
      ? 'foil_preference'
      : totalQty > keepTarget
        ? 'over_keep_cap'
        : reasonCodes[0],
    opportunityType: isFoilSwap ? 'foil_swap' : totalQty > keepTarget ? 'over_cap' : null,
    keepTargetSatisfiedByNormal,
  };
}

function allocateRecommendedSellQuantities(
  sourceItems: SellabilitySourceItem[],
  sellNormalQty: number,
  sellFoilQty: number,
): SellabilitySourceItem[] {
  let remainingNormal = sellNormalQty;
  let remainingFoil = sellFoilQty;

  return sourceItems.map((sourceItem) => {
    const remaining = sourceItem.finishKind === 'foil' ? remainingFoil : remainingNormal;
    const recommendedSellQuantity = Math.min(sourceItem.quantity, remaining);

    if (sourceItem.finishKind === 'foil') {
      remainingFoil -= recommendedSellQuantity;
    } else {
      remainingNormal -= recommendedSellQuantity;
    }

    return { ...sourceItem, recommendedSellQuantity };
  });
}

export function computeCollectionSellability(
  items: SellabilityCollectionItemInput[],
): SellabilityRow[] {
  const grouped = new Map<
    number,
    {
      card: SellabilityCatalogCardInput;
      normalQty: number;
      foilQty: number;
      sourceItems: SellabilitySourceItem[];
    }
  >();

  for (const item of items) {
    const existing = grouped.get(item.catalogCardId) ?? {
      card: item,
      normalQty: 0,
      foilQty: 0,
      sourceItems: [],
    };
    const finish = item.finish?.trim() || DEFAULT_FINISH;
    const finishKind = normalizeFinishKind(item.finish);

    existing.sourceItems.push({
      collectionItemId: item.collectionItemId ?? null,
      finish,
      finishKind,
      condition: item.condition?.trim() || DEFAULT_CONDITION,
      language: item.language?.trim().toUpperCase() || DEFAULT_LANGUAGE,
      quantity: item.quantity,
      recommendedSellQuantity: 0,
    });

    if (finishKind === 'foil') {
      existing.foilQty += item.quantity;
    } else {
      existing.normalQty += item.quantity;
    }

    grouped.set(item.catalogCardId, existing);
  }

  return [...grouped.values()]
    .map(({ card, normalQty, foilQty, sourceItems }) => {
      const classified = classifyCatalogCard(card);
      const allocations = computeAllocations(classified.kind, normalQty, foilQty);
      const allocatedSourceItems = allocateRecommendedSellQuantities(
        sourceItems,
        allocations.sellNormalQty,
        allocations.sellFoilQty,
      );

      return {
        ...cardIdentity(card),
        kind: classified.kind,
        kindSource: classified.kindSource,
        cardKindSource: classified.cardKindSource,
        normalQty,
        foilQty,
        totalQty: normalQty + foilQty,
        ...allocations,
        needsClassification:
          allocations.needsClassification || classified.needsClassification,
        sourceItems: allocatedSourceItems,
        transferItems: allocatedSourceItems.filter(
          (sourceItem) => sourceItem.recommendedSellQuantity > 0,
        ),
      };
    })
    .sort((left, right) => {
      const leftSell = left.sellNormalQty + left.sellFoilQty;
      const rightSell = right.sellNormalQty + right.sellFoilQty;
      if (leftSell !== rightSell) {
        return rightSell - leftSell;
      }
      return left.productName.localeCompare(right.productName);
    });
}
