import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { scannerRoutes } from '../scanner.js';
import { cards } from '../../db/schema/cards.js';

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from '../../db/index.js';

function queryRows(rows: unknown[]) {
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

function mockCatalogRows(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValue(queryRows(rows) as any);
}

describe('scanner routes', () => {
  let app: FastifyInstance;

  async function register() {
    app = Fastify();
    await app.register(scannerRoutes, { prefix: '/api/scanner' });
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reports native-client scanner status without requiring server OCR binaries', async () => {
    await register();
    const lastSyncedAt = new Date('2026-07-26T03:30:00.000Z');
    vi.mocked(db.select)
      .mockReturnValueOnce(
        queryRows([
          { count: 9, lastSyncedAt: new Date('2026-07-26T03:00:00.000Z') },
        ]) as any,
      )
      .mockReturnValueOnce(queryRows([{ count: 321, lastSyncedAt }]) as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/scanner/status',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ocr: {
        engine: 'native-client',
        available: true,
        required: false,
      },
      catalog: {
        sets: 9,
        cards: 321,
        lastSyncedAt: lastSyncedAt.toISOString(),
        ready: true,
      },
    });
  });

  it('resolves native OCR text against cached catalog cards', async () => {
    await register();
    mockCatalogRows([
      {
        id: 209,
        productName: 'Dusk Rose Lab',
        collectorNumber: '209/219',
        normalizedNumber: '209/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: {
        rawText: 'UNL • 209/219',
        region: 'bottom-right',
        confidence: 0.91,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [
        {
          rawText: 'UNL • 209/219',
          region: 'bottom-right',
          setCode: 'UNL',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          confidence: 0.91,
          resolvedBy: 'catalogCode',
          match: {
            catalogCardId: 209,
            name: 'Dusk Rose Lab',
            setCode: 'UNL',
            number: '209/219',
          },
        },
      ],
      errors: [],
      debug: {
        regions: [
          {
            index: 0,
            region: 'bottom-right',
            rawText: 'UNL • 209/219',
            confidence: 0.91,
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: '209/219',
                normalizedNumber: '209/219',
              },
            ],
            errors: [],
          },
        ],
      },
    });
    expect(db.insert).not.toHaveBeenCalledWith(cards);
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('resolves full paired token collector numbers against cached catalog cards', async () => {
    await register();
    mockCatalogRows([
      {
        id: 696622,
        productName: 'Sprite // Buff',
        collectorNumber: 'T07 // T04',
        normalizedNumber: 'T07//T04',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Unleashed' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL T07 // T04', confidence: 0.8 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL T07 // T04',
          region: 'native',
          setCode: 'UNL',
          number: 'T07//T04',
          key: 'UNL:T07//T04',
          status: 'resolved',
          confidence: 0.8,
          resolvedBy: 'catalogCode',
          match: {
            catalogCardId: 696622,
            name: 'Sprite // Buff',
            setCode: 'UNL',
            number: 'T07 // T04',
          },
        },
      ],
      errors: [],
      debug: {
        regions: [
          expect.objectContaining({
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: 'T07//T04',
                normalizedNumber: 'T07//T04',
              },
            ],
          }),
        ],
      },
    });
  });

  it('returns ambiguous alternatives for bare token face collector numbers', async () => {
    await register();
    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(
        queryRows([
          {
            id: 696622,
            productName: 'Sprite // Buff',
            collectorNumber: 'T07 // T04',
            normalizedNumber: 'T07//T04',
            photoUrl: 'https://cdn.tcgtracking.com/product/696622_200w.jpg',
            set: { id: 1, setCode: 'UNL', name: 'Unleashed' },
          },
          {
            id: 695877,
            productName: 'Sprite // Gold',
            collectorNumber: 'T07 // T05',
            normalizedNumber: 'T07//T05',
            photoUrl: 'https://cdn.tcgtracking.com/product/695877_200w.jpg',
            set: { id: 1, setCode: 'UNL', name: 'Unleashed' },
          },
        ]) as any,
      );

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL - T07' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL - T07',
          region: 'native',
          setCode: 'UNL',
          number: 'T07',
          key: 'UNL:T07',
          status: 'ambiguous',
          resolvedBy: 'catalogCode',
          ambiguityReason: 'tokenFaceMatchesMultipleProducts',
          alternatives: [
            {
              catalogCardId: 696622,
              name: 'Sprite // Buff',
              setCode: 'UNL',
              number: 'T07 // T04',
              imageUrl: 'https://cdn.tcgtracking.com/product/696622_200w.jpg',
            },
            {
              catalogCardId: 695877,
              name: 'Sprite // Gold',
              setCode: 'UNL',
              number: 'T07 // T05',
              imageUrl: 'https://cdn.tcgtracking.com/product/695877_200w.jpg',
            },
          ],
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            parsedAttempts: [
              { setCode: 'UNL', number: 'T07', normalizedNumber: 'T07' },
            ],
          }),
        ],
      },
    });
  });

  it('resolves rune-style special collector numbers against cached catalog cards', async () => {
    await register();
    mockCatalogRows([
      {
        id: 696616,
        productName: 'Calm Rune',
        collectorNumber: 'R02',
        normalizedNumber: 'R02',
        photoUrl: 'https://cdn.tcgtracking.com/product/696616_200w.jpg',
        set: { id: 1, setCode: 'UNL', name: 'Unleashed' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL - R02', confidence: 0.77 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL - R02',
          region: 'native',
          setCode: 'UNL',
          number: 'R02',
          key: 'UNL:R02',
          status: 'resolved',
          confidence: 0.77,
          resolvedBy: 'catalogCode',
          match: {
            catalogCardId: 696616,
            name: 'Calm Rune',
            setCode: 'UNL',
            number: 'R02',
            imageUrl: 'https://cdn.tcgtracking.com/product/696616_200w.jpg',
          },
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            parsedAttempts: [
              { setCode: 'UNL', number: 'R02', normalizedNumber: 'R02' },
            ],
          }),
        ],
      },
    });
  });

  it('resolves rune-style special collector variants against cached catalog cards', async () => {
    await register();
    vi.mocked(db.select)
      .mockReturnValueOnce(
        queryRows([
          {
            id: 692933,
            productName: 'Calm Rune (R02a)',
            collectorNumber: 'R02a',
            normalizedNumber: 'R02A',
            photoUrl: null,
            set: { id: 1, setCode: 'UNL', name: 'Unleashed' },
          },
        ]) as any,
      )
      .mockReturnValueOnce(
        queryRows([
          {
            id: 694647,
            productName: 'Calm Rune (R02b)',
            collectorNumber: 'R02b',
            normalizedNumber: 'R02B',
            photoUrl: null,
            set: { id: 1, setCode: 'UNL', name: 'Unleashed' },
          },
        ]) as any,
      );

    const variantAResponse = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL R02a' },
    });
    const variantBResponse = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'R02b UNL' },
    });

    expect(variantAResponse.statusCode).toBe(200);
    expect(JSON.parse(variantAResponse.body)).toMatchObject({
      candidates: [
        {
          status: 'resolved',
          setCode: 'UNL',
          number: 'R02A',
          key: 'UNL:R02A',
          match: { catalogCardId: 692933, name: 'Calm Rune (R02a)' },
        },
      ],
    });
    expect(variantBResponse.statusCode).toBe(200);
    expect(JSON.parse(variantBResponse.body)).toMatchObject({
      candidates: [
        {
          status: 'resolved',
          setCode: 'UNL',
          number: 'R02B',
          key: 'UNL:R02B',
          match: { catalogCardId: 694647, name: 'Calm Rune (R02b)' },
        },
      ],
    });
  });

  it('returns unresolved for missing rune-style special collector numbers', async () => {
    await register();
    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([{ id: 1 }]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL R99' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL R99',
          region: 'native',
          setCode: 'UNL',
          number: 'R99',
          key: 'UNL:R99',
          status: 'unresolved',
          resolvedBy: 'catalogCode',
        },
      ],
    });
  });

  it('returns unresolved for missing bare token face collector numbers', async () => {
    await register();
    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([{ id: 1 }]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL T99' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL T99',
          region: 'native',
          setCode: 'UNL',
          number: 'T99',
          key: 'UNL:T99',
          status: 'unresolved',
          resolvedBy: 'catalogCode',
        },
      ],
    });
  });

  it('resolves noisy native OCR text with safe set-code correction', async () => {
    await register();
    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(
        queryRows([
          {
            id: 209,
            productName: 'Dusk Rose Lab',
            collectorNumber: '209/219',
            normalizedNumber: '209/219',
            photoUrl: null,
            set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
          },
        ]) as any,
      );

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: {
        rawText: 'B E J . UN. 209/219 S . 5S UN. 209/215',
        confidence: 0.72,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'B E J . UN. 209/219 S . 5S UN. 209/215',
          region: 'native',
          setCode: 'UNL',
          correctedFromSetCode: 'UN',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          confidence: 0.72,
          match: { catalogCardId: 209, name: 'Dusk Rose Lab' },
        },
      ],
      errors: [],
      debug: {
        regions: [
          expect.objectContaining({
            region: 'native',
            rawText: 'B E J . UN. 209/219 S . 5S UN. 209/215',
            parsedAttempts: [
              { setCode: 'UN', number: '209/219', normalizedNumber: '209/219' },
              { setCode: 'UN', number: '209/215', normalizedNumber: '209/215' },
            ],
          }),
        ],
      },
    });
  });

  it('falls back to an exact unambiguous catalog name from slash-delimited native OCR', async () => {
    await register();
    mockCatalogRows([
      {
        id: 100,
        productName: 'Inferna',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: '2 / Inferna', confidence: 0.66 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: '2 / Inferna',
          region: 'native',
          setCode: 'UNL',
          number: '002/219',
          key: 'catalog:100',
          status: 'resolved',
          confidence: 0.66,
          resolvedBy: 'name',
          nameAttempt: 'Inferna',
          match: {
            catalogCardId: 100,
            name: 'Inferna',
            setCode: 'UNL',
            number: '002/219',
          },
        },
      ],
      errors: [],
      debug: {
        regions: [
          expect.objectContaining({
            rawText: '2 / Inferna',
            parsedAttempts: [],
            nameAttempts: ['Inferna'],
          }),
        ],
      },
    });
  });

  it('returns ambiguous for duplicate exact catalog name fallback matches', async () => {
    await register();
    mockCatalogRows([
      {
        id: 100,
        productName: 'Inferna',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
      {
        id: 101,
        productName: 'Inferna',
        collectorNumber: '002A/219',
        normalizedNumber: '2A/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: '2 / Inferna' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: '2 / Inferna',
          region: 'native',
          setCode: null,
          number: null,
          key: 'name:inferna',
          status: 'ambiguous',
          resolvedBy: 'name',
          nameAttempt: 'Inferna',
          alternatives: [
            { catalogCardId: 100, name: 'Inferna' },
            { catalogCardId: 101, name: 'Inferna' },
          ],
        },
      ],
    });
  });

  it('returns slash-delimited name fallback debug without candidates when catalog has no exact name match', async () => {
    await register();
    mockCatalogRows([]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: '2 / Inferna', confidence: 0.5 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [],
      errors: [],
      debug: {
        regions: [
          {
            index: 0,
            region: 'native',
            rawText: '2 / Inferna',
            confidence: 0.5,
            parsedAttempts: [],
            nameAttempts: ['Inferna'],
            errors: [],
          },
        ],
      },
    });
  });

  it('returns ambiguous and unresolved native OCR text without mutating inventory', async () => {
    await register();
    mockCatalogRows([
      {
        id: 1,
        productName: 'Battlefield A',
        collectorNumber: '209/219',
        normalizedNumber: '209/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
      {
        id: 2,
        productName: 'Battlefield B',
        collectorNumber: '209/219',
        normalizedNumber: '209/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const ambiguousResponse = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL 209/219' },
    });

    expect(ambiguousResponse.statusCode).toBe(200);
    expect(JSON.parse(ambiguousResponse.body)).toMatchObject({
      candidates: [
        {
          status: 'ambiguous',
          region: 'native',
          alternatives: [
            { catalogCardId: 1, name: 'Battlefield A' },
            { catalogCardId: 2, name: 'Battlefield B' },
          ],
        },
      ],
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([{ id: 1 }]) as any);

    const unresolvedResponse = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL 999/219' },
    });

    expect(unresolvedResponse.statusCode).toBe(200);
    expect(JSON.parse(unresolvedResponse.body)).toMatchObject({
      candidates: [
        {
          status: 'unresolved',
          region: 'native',
          setCode: 'UNL',
          number: '999/219',
        },
      ],
    });
    expect(db.insert).not.toHaveBeenCalledWith(cards);
    expect(db.update).not.toHaveBeenCalledWith(cards);
  });

  it('returns native OCR debug without candidates when text cannot be resolved', async () => {
    await register();
    mockCatalogRows([]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'not a card id', confidence: 0.4 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [],
      errors: [],
      debug: {
        regions: [
          {
            index: 0,
            region: 'native',
            rawText: 'not a card id',
            confidence: 0.4,
            parsedAttempts: [],
            nameAttempts: ['not a card id'],
            errors: [],
          },
        ],
      },
    });
  });

  it('validates malformed native OCR resolve-text input', async () => {
    await register();

    const missing = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(JSON.parse(missing.body)).toEqual({
      error: 'rawText must be a string',
    });

    const empty = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    expect(JSON.parse(empty.body)).toEqual({
      error: 'rawText must be non-empty',
    });

    const tooLong = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'A'.repeat(2_001) },
    });
    expect(tooLong.statusCode).toBe(413);
    expect(JSON.parse(tooLong.body)).toEqual({
      error: 'rawText exceeds 2000 character limit',
    });

    const badRegion = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL 209/219', region: 'center' },
    });
    expect(badRegion.statusCode).toBe(400);
    expect(JSON.parse(badRegion.body)).toEqual({
      error:
        'region must be native, bottom-left, bottom-left-strip, or bottom-right',
    });

    const badConfidence = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'UNL 209/219', confidence: '0.8' },
    });
    expect(badConfidence.statusCode).toBe(400);
    expect(JSON.parse(badConfidence.body)).toEqual({
      error: 'confidence must be a finite number',
    });

    const badSetCodeHint = await app.inject({
      method: 'POST',
      url: '/api/scanner/resolve-text',
      payload: { rawText: 'Inferna', setCodeHint: '' },
    });
    expect(badSetCodeHint.statusCode).toBe(400);
    expect(JSON.parse(badSetCodeHint.body)).toEqual({
      error: 'setCodeHint must be a non-empty string when provided',
    });
  });

  it('does not expose the removed server-side image OCR recognition endpoint', async () => {
    await register();

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: { images: [] },
    });

    expect(response.statusCode).toBe(404);
  });
});
