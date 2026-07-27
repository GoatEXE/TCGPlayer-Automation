import { describe, expect, it } from 'vitest';
import {
  computeCollectionSellability,
  computeScanSessionPreview,
  type SellabilityCatalogCardInput,
} from '../sellability.js';

function card(
  id: number,
  productName: string,
  cardKind?: SellabilityCatalogCardInput['cardKind'],
  normalizedNumber = `${id}/200`,
): SellabilityCatalogCardInput {
  return {
    catalogCardId: id,
    productName,
    cardKind,
    normalizedNumber,
    collectorNumber: normalizedNumber,
    set: { id: 1, setCode: 'UNL', name: 'Origins' },
  };
}

describe('computeCollectionSellability', () => {
  it('keeps up to 3 normal-card copies and recommends selling duplicates beyond 3', () => {
    const [row] = computeCollectionSellability([
      { ...card(1, 'Brave Pup', 'normal'), finish: 'Normal', quantity: 4 },
    ]);

    expect(row).toMatchObject({
      kind: 'normal',
      keepTarget: 3,
      keepNormalQty: 3,
      sellNormalQty: 1,
      sellFoilQty: 0,
      excluded: false,
    });
    expect(row.reasons).toContain('over_keep_cap');
  });

  it('keeps up to 1 legend or battlefield copy', () => {
    const rows = computeCollectionSellability([
      { ...card(2, 'Mighty Legend', 'legend'), finish: 'Normal', quantity: 2 },
      { ...card(3, 'Grand Battlefield', 'battlefield'), finish: 'Normal', quantity: 3 },
    ]);

    expect(rows.find((row) => row.catalogCardId === 2)).toMatchObject({
      keepTarget: 1,
      sellNormalQty: 1,
      reasons: expect.arrayContaining(['legend_keep_1']),
    });
    expect(rows.find((row) => row.catalogCardId === 3)).toMatchObject({
      keepTarget: 1,
      sellNormalQty: 2,
      reasons: expect.arrayContaining(['battlefield_keep_1']),
    });
  });

  it('prefers keeping normal copies and selling foil copies first', () => {
    const [row] = computeCollectionSellability([
      { ...card(4, 'Balanced Unit', 'normal'), finish: 'Normal', quantity: 3 },
      { ...card(4, 'Balanced Unit', 'normal'), finish: 'Foil', quantity: 2 },
    ]);

    expect(row).toMatchObject({
      keepNormalQty: 3,
      keepFoilQty: 0,
      sellNormalQty: 0,
      sellFoilQty: 2,
    });
    expect(row.reasons).toContain('foil_preference_sell_foil_first');
    expect(row).toMatchObject({
      primaryReasonCode: 'foil_preference',
      opportunityType: 'foil_swap',
      keepTargetSatisfiedByNormal: true,
    });
  });

  it('keeps foil-only cards up to the cap and sells extra foils', () => {
    const [row] = computeCollectionSellability([
      { ...card(5, 'Sparkly Unit', 'normal'), finish: 'Foil', quantity: 4 },
    ]);

    expect(row).toMatchObject({
      keepNormalQty: 0,
      keepFoilQty: 3,
      sellFoilQty: 1,
    });
  });

  it('keeps foil copies when there are insufficient normal copies', () => {
    const [row] = computeCollectionSellability([
      { ...card(6, 'Mixed Unit', 'normal'), finish: 'Normal', quantity: 1 },
      { ...card(6, 'Mixed Unit', 'normal'), finish: 'Foil', quantity: 1 },
    ]);

    expect(row).toMatchObject({
      keepNormalQty: 1,
      keepFoilQty: 1,
      sellFoilQty: 0,
    });
    expect(row.reasons).toContain('insufficient_normals_keep_foil');
  });

  it('excludes tokens and runes from sell recommendations with automatic detection', () => {
    const rows = computeCollectionSellability([
      { ...card(7, 'Sprite Token', null, 'T07'), finish: 'Normal', quantity: 10 },
      { ...card(8, 'Calm Rune', null, 'R02'), finish: 'Foil', quantity: 10 },
    ]);

    expect(rows.find((row) => row.catalogCardId === 7)).toMatchObject({
      kind: 'token',
      excluded: true,
      sellNormalQty: 0,
    });
    expect(rows.find((row) => row.catalogCardId === 8)).toMatchObject({
      kind: 'rune',
      excluded: true,
      sellFoilQty: 0,
    });
  });

  it('infers normal, legend, and battlefield kinds from safe catalog signals', () => {
    const rows = computeCollectionSellability([
      {
        ...card(90, 'Inferna', null, '002/219'),
        finish: 'Normal',
        quantity: 4,
      },
      {
        ...card(91, 'Kha\'Zix - Voidreaver', null, '201/219'),
        finish: 'Normal',
        quantity: 2,
      },
      {
        ...card(92, 'Dusk Rose Lab', null, '209/219'),
        finish: 'Normal',
        quantity: 2,
      },
    ]);

    expect(rows.find((row) => row.catalogCardId === 90)).toMatchObject({
      kind: 'normal',
      cardKindSource: 'inferred',
      keepTarget: 3,
      sellNormalQty: 1,
    });
    expect(rows.find((row) => row.catalogCardId === 91)).toMatchObject({
      kind: 'legend',
      cardKindSource: 'inferred',
      keepTarget: 1,
      sellNormalQty: 1,
    });
    expect(rows.find((row) => row.catalogCardId === 92)).toMatchObject({
      kind: 'battlefield',
      cardKindSource: 'inferred',
      keepTarget: 1,
      sellNormalQty: 1,
    });
  });

  it('uses curated source metadata instead of name-only heuristics for numbered runes', () => {
    const [curatedRune, unrelatedRuneName] = computeCollectionSellability([
      {
        ...card(93, 'Calm Rune', null, '42/298'),
        set: { id: 2, setCode: 'OGN', name: 'Origins' },
        finish: 'Normal',
        quantity: 4,
      },
      {
        ...card(96, 'Rune-Etched Training Sword', null, '001/999'),
        finish: 'Normal',
        quantity: 4,
      },
    ]).sort((left, right) => left.catalogCardId - right.catalogCardId);

    expect(curatedRune).toMatchObject({
      kind: 'rune',
      cardKindSource: 'inferred',
      excluded: true,
      sellNormalQty: 0,
    });
    expect(unrelatedRuneName).toMatchObject({
      kind: 'normal',
      cardKindSource: 'inferred',
      excluded: false,
      sellNormalQty: 1,
    });
  });

  it('infers kind from future structured raw product fields', () => {
    const [row] = computeCollectionSellability([
      {
        ...card(95, 'Structured Battlefield', null, 'PROMO'),
        raw: { extendedData: [{ name: 'Card Type', value: 'Battlefield' }] },
        finish: 'Normal',
        quantity: 2,
      },
    ]);

    expect(row).toMatchObject({
      kind: 'battlefield',
      cardKindSource: 'inferred',
      keepTarget: 1,
      sellNormalQty: 1,
    });
  });

  it('does not classify hyphenated names as legends without source metadata', () => {
    const [row] = computeCollectionSellability([
      {
        ...card(97, 'Made-Up - Hyphenated Card', null, '001/999'),
        set: { id: 99, setCode: 'ABC', name: 'Unknown Set' },
        finish: 'Normal',
        quantity: 4,
      },
    ]);

    expect(row).toMatchObject({
      kind: 'normal',
      cardKindSource: 'inferred',
      keepTarget: 3,
      sellNormalQty: 1,
    });
  });

  it('allows explicit metadata to override inferred classification', () => {
    const [row] = computeCollectionSellability([
      { ...card(94, 'Sprite // Buff', 'normal', 'T07//T04'), finish: 'Normal', quantity: 4 },
    ]);

    expect(row).toMatchObject({
      kind: 'normal',
      cardKindSource: 'metadata',
      excluded: false,
      sellNormalQty: 1,
    });
  });

  it('keeps unknown cards safely and flags them for classification', () => {
    const [row] = computeCollectionSellability([
      { ...card(9, 'Mystery Card', null, 'MYSTERY'), finish: 'Normal', quantity: 9 },
    ]);

    expect(row).toMatchObject({
      kind: 'unknown',
      keepTarget: null,
      sellNormalQty: 0,
      needsClassification: true,
      excluded: false,
    });
    expect(row.reasons).toContain('unknown_kind_kept_safe');
  });

  it('groups existing collection rows by catalog card and finish', () => {
    const [row] = computeCollectionSellability([
      { ...card(10, 'Grouped Unit', 'normal'), finish: 'Normal', quantity: 1 },
      { ...card(10, 'Grouped Unit', 'normal'), finish: 'Normal', quantity: 2 },
      { ...card(10, 'Grouped Unit', 'normal'), finish: 'Foil', quantity: 1 },
    ]);

    expect(row).toMatchObject({
      normalQty: 3,
      foilQty: 1,
      keepNormalQty: 3,
      sellFoilQty: 1,
    });
  });

  it('exposes transfer-ready collection item ids for normal duplicate recommendations', () => {
    const [row] = computeCollectionSellability([
      {
        ...card(1010, 'Transfer Unit', 'normal'),
        collectionItemId: 501,
        finish: 'Normal',
        quantity: 2,
      },
      {
        ...card(1010, 'Transfer Unit', 'normal'),
        collectionItemId: 502,
        finish: 'Normal',
        quantity: 2,
      },
    ]);

    expect(row).toMatchObject({ sellNormalQty: 1 });
    expect(row.sourceItems).toEqual([
      expect.objectContaining({
        collectionItemId: 501,
        quantity: 2,
        recommendedSellQuantity: 1,
      }),
      expect.objectContaining({
        collectionItemId: 502,
        quantity: 2,
        recommendedSellQuantity: 0,
      }),
    ]);
    expect(row.transferItems).toEqual([
      expect.objectContaining({ collectionItemId: 501, recommendedSellQuantity: 1 }),
    ]);
  });

  it('exposes foil source collection item for foil-swap transfer recommendations', () => {
    const [row] = computeCollectionSellability([
      {
        ...card(1011, 'Foil Swap Unit', 'normal'),
        collectionItemId: 601,
        finish: 'Normal',
        quantity: 3,
      },
      {
        ...card(1011, 'Foil Swap Unit', 'normal'),
        collectionItemId: 602,
        finish: 'Foil',
        quantity: 1,
      },
    ]);

    expect(row).toMatchObject({
      sellFoilQty: 1,
      opportunityType: 'foil_swap',
    });
    expect(row.transferItems).toEqual([
      expect.objectContaining({
        collectionItemId: 602,
        finishKind: 'foil',
        quantity: 1,
        recommendedSellQuantity: 1,
      }),
    ]);
  });
});

describe('computeScanSessionPreview', () => {
  it('uses existing collection counts to split scanned keep and sell rows', () => {
    const preview = computeScanSessionPreview({
      catalogCards: [card(11, 'Extra Unit', 'normal')],
      scannedItems: [
        { catalogCardId: 11, finish: 'Normal', quantity: 2 },
        { catalogCardId: 11, finish: 'Foil', quantity: 1 },
      ],
      existingCountsByCatalogCardId: new Map([[11, { normalQty: 2, foilQty: 0 }]]),
    });

    expect(preview.summary).toMatchObject({ sellQuantity: 2, keepQuantity: 1 });
    expect(preview.groups.sell).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          finishKind: 'foil',
          quantity: 1,
          primaryReasonCode: 'foil_preference',
          opportunityType: 'foil_swap',
          keepTargetSatisfiedByNormal: true,
        }),
        expect.objectContaining({ finishKind: 'normal', quantity: 1 }),
      ]),
    );
    expect(preview.groups.keep).toEqual([
      expect.objectContaining({ finishKind: 'normal', quantity: 1 }),
    ]);
  });

  it('keeps scanned unknowns and excludes scanned tokens/runes from sell actions', () => {
    const preview = computeScanSessionPreview({
      catalogCards: [card(12, 'Unknown Champ', null, 'MYSTERY'), card(13, 'Calm Rune', null, 'R02')],
      scannedItems: [
        { catalogCardId: 12, finish: 'Normal', quantity: 5 },
        { catalogCardId: 13, finish: 'Normal', quantity: 5 },
      ],
    });

    expect(preview.summary).toMatchObject({
      sellQuantity: 0,
      keepQuantity: 5,
      excludedQuantity: 5,
      needsClassificationQuantity: 5,
    });
    expect(preview.groups.excluded[0]).toMatchObject({ kind: 'rune' });
  });
});
