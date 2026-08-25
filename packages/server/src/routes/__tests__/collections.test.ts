import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { collectionsRoutes } from '../collections.js';
import { cards } from '../../db/schema/cards.js';
import { catalogCards, catalogSets } from '../../db/schema/catalog.js';
import { collectionItems } from '../../db/schema/collections.js';

const dbMocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../../db/index.js', () => dbMocks);

const tcgtrackingMocks = vi.hoisted(() => ({
  getPricing: vi.fn(),
}));

vi.mock('../../lib/tcgtracking/client.js', () => ({
  TCGTrackingClient: class {
    getPricing = tcgtrackingMocks.getPricing;
  },
}));

import { db } from '../../db/index.js';

const getFormHeaders = (form: FormData): Record<string, string> => {
  if ('getHeaders' in form) {
    return (
      form as FormData & { getHeaders: () => Record<string, string> }
    ).getHeaders();
  }

  return {};
};

function selectRows(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    then: vi.fn((resolve, reject) =>
      Promise.resolve(rows).then(resolve, reject),
    ),
  };
}

function mockDelete() {
  vi.mocked(db.delete).mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  } as any);
}

describe('collection routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(db.transaction).mockImplementation((callback: any) => callback(db));
    tcgtrackingMocks.getPricing.mockResolvedValue(null);
    app = Fastify();
    await app.register(multipart);
    await app.register(collectionsRoutes, { prefix: '/api/collections' });
  });

  it('returns collections and ensures the default collection exists', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    } as any);
    vi.mocked(db.select).mockReturnValue(
      selectRows([{ id: 1, name: 'Default' }]) as any,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/collections',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      collections: [{ id: 1, name: 'Default' }],
    });
  });

  it('previews TCGPlayer collection CSV import without touching inventory', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(selectRows([{ id: 100 }]) as any);

    const csv = `Product ID,TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,Printing,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL\n685590,9197684,Riftbound: League of Legends Trading Card Game,Unleashed,Voracious Gromp,,100/219,Common,Near Mint,Normal,0.07,,,,3,,,https://tcgplayer-cdn.tcgplayer.com/product/685590_in_400x400.jpg`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'collection.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/1/import/preview',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      mode: 'merge',
      source: 'tcgplayer_collection_csv',
      summary: {
        totalRows: 1,
        parsedRows: 1,
        matchedCatalogRows: 1,
        createdCatalogRows: 0,
        unresolvedRows: 0,
        totalQuantity: 3,
        normalQuantity: 3,
        foilQuantity: 0,
      },
      rows: [
        expect.objectContaining({
          status: 'matched',
          catalogCardId: 100,
          finish: 'Normal',
          quantity: 3,
        }),
      ],
    });
    expect(db.insert).not.toHaveBeenCalledWith(cards);
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('creates missing catalog snapshots from CSV fields during import', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([{ id: 10, name: 'Unleashed', setCode: 'UNL' }]) as any)
      .mockReturnValueOnce(selectRows([{ id: 101 }]) as any)
      .mockReturnValueOnce(selectRows([]) as any);
    vi.mocked(db.insert).mockImplementation((table) => {
      if (table === catalogSets || table === catalogCards) {
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        } as any;
      }

      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: 501, collectionId: 1, catalogCardId: 101, quantity: 1 },
          ]),
        }),
      } as any;
    });

    const csv = `Product ID,TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,Printing,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL\n999999,9191466,Riftbound: League of Legends Trading Card Game,Unleashed,New Snapshot Card,,203/219,Rare,Near Mint,Normal,0.16,,,,1,,,https://tcgplayer-cdn.tcgplayer.com/product/999999_in_400x400.jpg`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'collection.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/1/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      summary: { createdCatalogRows: 1, unresolvedRows: 0 },
      rows: [expect.objectContaining({ status: 'created', catalogCardId: 101 })],
      inserted: 1,
    });
    expect(db.insert).toHaveBeenCalledWith(catalogCards);
    expect(db.insert).toHaveBeenCalledWith(collectionItems);
    expect(db.insert).not.toHaveBeenCalledWith(cards);
  });

  it('imports TCGPlayer collection CSV rows into collection items only', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(selectRows([{ id: 100 }]) as any)
      .mockReturnValueOnce(selectRows([]) as any);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 500,
            collectionId: 1,
            catalogCardId: 100,
            condition: 'Near Mint',
            finish: 'Foil',
            quantity: 1,
            source: 'tcgplayer_collection_csv',
          },
        ]),
      }),
    } as any);

    const csv = `Product ID,TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,Printing,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL\n684523,9191466,Riftbound: League of Legends Trading Card Game,Unleashed,Poppy - Keeper of the Hammer,,203/219,Rare,Near Mint,Foil,0.16,,,,1,,,https://tcgplayer-cdn.tcgplayer.com/product/684523_in_400x400.jpg`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'collection.csv');

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/1/import',
      payload: form,
      headers: getFormHeaders(form),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      inserted: 1,
      updated: 0,
      summary: { totalQuantity: 1, foilQuantity: 1 },
      items: [expect.objectContaining({ catalogCardId: 100, finish: 'Foil' })],
    });
    expect(db.insert).toHaveBeenCalledWith(collectionItems);
    expect(db.insert).not.toHaveBeenCalledWith(cards);
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('sellability response includes transfer-ready source collection item references', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 10,
            catalogCardId: 100,
            tcgProductId: 685590,
            productName: 'Transfer Unit',
            title: null,
            collectorNumber: '100/219',
            normalizedNumber: '100/219',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: {},
            quantity: 3,
            finish: 'Normal',
            condition: 'Near Mint',
            language: 'EN',
            set: { id: 2, setCode: 'UNL', name: 'Unleashed' },
          },
          {
            collectionItemId: 11,
            catalogCardId: 100,
            tcgProductId: 685590,
            productName: 'Transfer Unit',
            title: null,
            collectorNumber: '100/219',
            normalizedNumber: '100/219',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: {},
            quantity: 1,
            finish: 'Foil',
            condition: 'Near Mint',
            language: 'EN',
            set: { id: 2, setCode: 'UNL', name: 'Unleashed' },
          },
        ]) as any,
      );

    const response = await app.inject({
      method: 'GET',
      url: '/api/collections/1/sellability',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      rows: [
        expect.objectContaining({
          sellFoilQty: 1,
          transferItems: [
            expect.objectContaining({
              collectionItemId: 11,
              finishKind: 'foil',
              recommendedSellQuantity: 1,
            }),
          ],
        }),
      ],
    });
  });

  it('clears only selected collection items with explicit confirmation', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          { id: 10, quantity: 3 },
          { id: 11, quantity: 2 },
        ]) as any,
      );
    mockDelete();

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/1/clear',
      payload: { confirmation: 'CLEAR COLLECTION' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      collection: { id: 1, name: 'Default', purpose: 'owned' },
      deletedItems: 2,
      deletedQuantity: 5,
    });
    expect(db.transaction).toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledWith(collectionItems);
    expect(db.delete).not.toHaveBeenCalledWith(cards);
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('rejects collection clear without exact confirmation', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/1/clear',
      payload: { confirmation: 'clear' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'confirmation must equal CLEAR COLLECTION',
      collection: { id: 1, name: 'Default', purpose: 'owned' },
    });
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('clears an already-empty collection as a no-op', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 3, name: 'Empty', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(selectRows([]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/3/clear',
      payload: { confirmation: 'CLEAR COLLECTION' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      collection: { id: 3, name: 'Empty', purpose: 'owned' },
      deletedItems: 0,
      deletedQuantity: 0,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('previews collection transfer to selling inventory without merging listed rows', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 20,
            collectionId: 2,
            catalogCardId: 100,
            tcgProductId: 685590,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            productName: 'Voracious Gromp',
            title: null,
            number: '100/219',
            normalizedNumber: '100/219',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: { snapshotMarketPrice: 0.5 },
            condition: 'Near Mint',
            finish: 'Normal',
            language: 'EN',
            availableQuantity: 2,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([{ id: 999 }]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory/preview',
      payload: { items: [{ collectionItemId: 20, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      summary: {
        requestedItems: 1,
        transferableItems: 1,
        blockedItems: 0,
        transferQuantity: 1,
        createRows: 1,
        updateRows: 0,
      },
      items: [
        expect.objectContaining({
          action: 'create',
          status: 'matched',
          marketPrice: 0.5,
          listingPrice: 0.49,
          warnings: ['listed_inventory_row_exists_not_merged'],
        }),
      ],
    });
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('uses TCGTracking set pricing for transfer preview when no local market snapshot exists', async () => {
    tcgtrackingMocks.getPricing.mockResolvedValueOnce({
      set_id: 24560,
      updated: '2026-07-26T00:00:00Z',
      prices: {
        '684213': { tcg: { Normal: { low: 0.04, market: 0.09 } } },
      },
    });
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 24,
            collectionId: 2,
            catalogCardId: 104,
            tcgProductId: 684213,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            setTcgtrackingSetId: 24560,
            productName: 'Inferna',
            title: null,
            number: '002/219',
            normalizedNumber: '2/219',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: {},
            condition: 'Near Mint',
            finish: 'Normal',
            language: 'EN',
            availableQuantity: 1,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory/preview',
      payload: { items: [{ collectionItemId: 24, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      items: [
        expect.objectContaining({
          status: 'matched',
          marketPrice: 0.09,
          listingPrice: 0.09,
          warnings: [],
        }),
      ],
    });
    expect(tcgtrackingMocks.getPricing).toHaveBeenCalledWith(24560);
  });

  it('keeps missing transfer price as needs_attention with a warning', async () => {
    tcgtrackingMocks.getPricing.mockResolvedValueOnce({
      set_id: 24560,
      updated: '2026-07-26T00:00:00Z',
      prices: {},
    });
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 25,
            collectionId: 2,
            catalogCardId: 105,
            tcgProductId: 999999,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            setTcgtrackingSetId: 24560,
            productName: 'Unknown Price Card',
            title: null,
            number: '999/999',
            normalizedNumber: '999/999',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: {},
            condition: 'Near Mint',
            finish: 'Normal',
            language: 'EN',
            availableQuantity: 1,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory/preview',
      payload: { items: [{ collectionItemId: 25, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      items: [
        expect.objectContaining({
          status: 'needs_attention',
          marketPrice: null,
          listingPrice: null,
          warnings: ['missing_market_price_creates_needs_attention'],
        }),
      ],
    });
  });

  it('uses foil pricing for foil transfers', async () => {
    tcgtrackingMocks.getPricing.mockResolvedValueOnce({
      set_id: 24560,
      updated: '2026-07-26T00:00:00Z',
      prices: {
        '684213': {
          tcg: {
            Normal: { low: 0.04, market: 0.09 },
            Foil: { low: 0.07, market: 0.28 },
          },
        },
      },
    });
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 26,
            collectionId: 2,
            catalogCardId: 106,
            tcgProductId: 684213,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            setTcgtrackingSetId: 24560,
            productName: 'Inferna',
            title: null,
            number: '002/219',
            normalizedNumber: '2/219',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: {},
            condition: 'Near Mint',
            finish: 'Foil',
            language: 'EN',
            availableQuantity: 1,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory/preview',
      payload: { items: [{ collectionItemId: 26, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      items: [
        expect.objectContaining({
          inventoryCondition: 'Near Mint Foil',
          status: 'matched',
          marketPrice: 0.28,
          listingPrice: 0.27,
          warnings: [],
        }),
      ],
    });
  });

  it('commits foil transfer by creating inventory row and decrementing source collection', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 21,
            collectionId: 2,
            catalogCardId: 101,
            tcgProductId: 684523,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            productName: 'Poppy - Keeper of the Hammer',
            title: null,
            number: '203/219',
            normalizedNumber: '203/219',
            rarity: 'Rare',
            photoUrl: null,
            cardKind: 'legend',
            raw: { snapshotMarketPrice: 1 },
            condition: 'Near Mint',
            finish: 'Foil',
            language: 'EN',
            availableQuantity: 2,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 300,
            tcgProductId: 684523,
            condition: 'Near Mint Foil',
            quantity: 1,
            status: 'matched',
            isFoilPrice: true,
          },
        ]),
      }),
    } as any);
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory',
      payload: { items: [{ collectionItemId: 21, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      transferredCards: [
        expect.objectContaining({ condition: 'Near Mint Foil', isFoilPrice: true }),
      ],
    });
    expect(db.transaction).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledWith(cards);
    expect(db.update).toHaveBeenCalledWith(collectionItems);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 1 }),
    );
  });

  it('deletes source collection item when transfer consumes the full quantity', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 210,
            collectionId: 2,
            catalogCardId: 101,
            tcgProductId: 684523,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            productName: 'Poppy - Keeper of the Hammer',
            title: null,
            number: '203/219',
            normalizedNumber: '203/219',
            rarity: 'Rare',
            photoUrl: null,
            cardKind: 'legend',
            raw: { snapshotMarketPrice: 1 },
            condition: 'Near Mint',
            finish: 'Normal',
            language: 'EN',
            availableQuantity: 1,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 301, quantity: 1 }]),
      }),
    } as any);
    mockDelete();

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory',
      payload: { items: [{ collectionItemId: 210, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(db.delete).toHaveBeenCalledWith(collectionItems);
  });

  it('blocks insufficient quantity and token/rune transfers', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 1, name: 'Default', purpose: 'owned' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 22,
            collectionId: 1,
            catalogCardId: 102,
            tcgProductId: 696622,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            productName: 'Sprite // Buff',
            title: null,
            number: 'T07 // T04',
            normalizedNumber: 'T07//T04',
            rarity: 'None',
            photoUrl: null,
            cardKind: null,
            raw: {},
            condition: 'Near Mint',
            finish: 'Normal',
            language: 'EN',
            availableQuantity: 1,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/1/transfer-to-inventory/preview',
      payload: { items: [{ collectionItemId: 22, quantity: 2 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      summary: { transferableItems: 0, blockedItems: 1 },
      items: [
        expect.objectContaining({
          action: 'blocked',
          blockers: expect.arrayContaining([
            'insufficient_quantity',
            'token_excluded_from_selling_inventory',
          ]),
        }),
      ],
    });
  });

  it('does not merge collection transfer into listed selling inventory rows', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectRows([{ id: 2, name: 'To Be Sold', purpose: 'to_be_sold' }]) as any)
      .mockReturnValueOnce(
        selectRows([
          {
            collectionItemId: 23,
            collectionId: 2,
            catalogCardId: 103,
            tcgProductId: 685590,
            productLine: 'Riftbound',
            setName: 'Unleashed',
            setCode: 'UNL',
            productName: 'Voracious Gromp',
            title: null,
            number: '100/219',
            normalizedNumber: '100/219',
            rarity: 'Common',
            photoUrl: null,
            cardKind: 'normal',
            raw: { snapshotMarketPrice: 0.5 },
            condition: 'Near Mint',
            finish: 'Normal',
            language: 'EN',
            availableQuantity: 1,
          },
        ]) as any,
      )
      .mockReturnValueOnce(selectRows([]) as any)
      .mockReturnValueOnce(selectRows([{ id: 400 }]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/collections/2/transfer-to-inventory/preview',
      payload: { items: [{ collectionItemId: 23, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      items: [
        expect.objectContaining({
          action: 'create',
          targetCardId: null,
          warnings: ['listed_inventory_row_exists_not_merged'],
        }),
      ],
    });
  });

});
