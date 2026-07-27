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
import type { ScannerOcrService } from '../../lib/scanner/ocr.js';

const pngDataUrl = `data:image/png;base64,${Buffer.from('image').toString('base64')}`;

function queryRows(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
}

function mockCatalogRows(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValue(queryRows(rows) as any);
}

function mockOcr(
  results: Array<{ rawText: string; confidence: number }>,
): ScannerOcrService {
  return {
    recognize: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(results.shift() || { rawText: '', confidence: 0 }),
      ),
  };
}

describe('scanner routes', () => {
  let app: FastifyInstance;

  async function register(ocrService: ScannerOcrService) {
    app = Fastify();
    await app.register(scannerRoutes, {
      prefix: '/api/scanner',
      ocrService,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves native OCR text against cached catalog cards', async () => {
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));
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
    await register(mockOcr([]));

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

  it('recognizes and resolves scanner ROI images against cached catalog cards', async () => {
    await register(mockOcr([{ rawText: 'UNL • 002/219', confidence: 0.88 }]));
    mockCatalogRows([
      {
        id: 100,
        productName: 'Inferna',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: 'https://example.com/inferna.jpg',
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-left', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [
        {
          rawText: 'UNL • 002/219',
          region: 'bottom-left',
          setCode: 'UNL',
          number: '002/219',
          key: 'UNL:2/219',
          status: 'resolved',
          confidence: 0.88,
          resolvedBy: 'catalogCode',
          match: {
            catalogCardId: 100,
            name: 'Inferna',
            setCode: 'UNL',
            number: '002/219',
            imageUrl: 'https://example.com/inferna.jpg',
          },
        },
      ],
      errors: [],
      debug: {
        regions: [
          {
            index: 0,
            region: 'bottom-left',
            rawText: 'UNL • 002/219',
            confidence: 0.88,
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: '002/219',
                normalizedNumber: '2/219',
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

  it('accepts bottom-left-strip ROI images and resolves them like bottom-left text', async () => {
    const ocrService = mockOcr([{ rawText: 'UNL 002/219', confidence: 0.83 }]);
    await register(ocrService);
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-left-strip', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL 002/219',
          region: 'bottom-left-strip',
          setCode: 'UNL',
          number: '002/219',
          key: 'UNL:2/219',
          status: 'resolved',
          match: { catalogCardId: 100, name: 'Inferna' },
        },
      ],
      errors: [],
      debug: {
        regions: [
          expect.objectContaining({
            region: 'bottom-left-strip',
            rawText: 'UNL 002/219',
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: '002/219',
                normalizedNumber: '2/219',
              },
            ],
          }),
        ],
      },
    });
    expect(ocrService.recognize).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'bottom-left-strip' }),
    );
  });

  it('parses noisy small-ID OCR variants before cached catalog lookup', async () => {
    await register(mockOcr([{ rawText: 'UNL©002/219', confidence: 0.61 }]));
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-left', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).candidates[0]).toMatchObject({
      rawText: 'UNL©002/219',
      setCode: 'UNL',
      number: '002/219',
      key: 'UNL:2/219',
      status: 'resolved',
      match: { catalogCardId: 100, name: 'Inferna' },
    });
  });

  it('parses and resolves ID-focused fallback OCR after punctuation-only primary text', async () => {
    await register(
      mockOcr([{ rawText: '-\nUNL • 209/219', confidence: 0.85 }]),
    );
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: '-\nUNL • 209/219',
          region: 'bottom-right',
          setCode: 'UNL',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          match: { catalogCardId: 209, name: 'Dusk Rose Lab' },
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            region: 'bottom-right',
            rawText: '-\nUNL • 209/219',
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: '209/219',
                normalizedNumber: '209/219',
              },
            ],
          }),
        ],
      },
    });
  });

  it('resolves noisy battlefield OCR by preferring the attempt that safely corrects to a cached card', async () => {
    await register(
      mockOcr([
        {
          rawText: 'B E J . UN. 209/219 S . 5S UN. 209/215',
          confidence: 0.71,
        },
      ]),
    );
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'B E J . UN. 209/219 S . 5S UN. 209/215',
          region: 'bottom-right',
          setCode: 'UNL',
          correctedFromSetCode: 'UN',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          match: { catalogCardId: 209, name: 'Dusk Rose Lab' },
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            rawText: 'B E J . UN. 209/219 S . 5S UN. 209/215',
            parsedAttempts: [
              {
                setCode: 'UN',
                number: '209/219',
                normalizedNumber: '209/219',
              },
              {
                setCode: 'UN',
                number: '209/215',
                normalizedNumber: '209/215',
              },
            ],
          }),
        ],
      },
    });
  });

  it('safely corrects single-edit noisy set codes when one cached card matches', async () => {
    await register(mockOcr([{ rawText: 'JNL 209/219', confidence: 0.74 }]));
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'JNL 209/219',
          region: 'bottom-right',
          setCode: 'UNL',
          correctedFromSetCode: 'JNL',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          match: { catalogCardId: 209, name: 'Dusk Rose Lab' },
        },
      ],
    });
  });

  it('resolves exact noisy OCR examples when a later attempt safely corrects to a cached card', async () => {
    await register(
      mockOcr([
        { rawText: '-1.T -JL 209/219 ... JNL 209/719', confidence: 0.68 },
      ]),
    );
    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([]) as any)
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: '-1.T -JL 209/219 ... JNL 209/719',
          region: 'bottom-right',
          setCode: 'UNL',
          correctedFromSetCode: 'JNL',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          match: { catalogCardId: 209, name: 'Dusk Rose Lab' },
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            rawText: '-1.T -JL 209/219 ... JNL 209/719',
            parsedAttempts: [
              {
                setCode: 'JL',
                number: '209/219',
                normalizedNumber: '209/219',
              },
              {
                setCode: 'JNL',
                number: '209/719',
                normalizedNumber: '209/719',
              },
              {
                setCode: 'JNL',
                number: '209/219',
                normalizedNumber: '209/219',
              },
            ],
          }),
        ],
      },
    });
  });

  it('safely corrects a clipped leading set-code character when one cached suffix match exists', async () => {
    await register(mockOcr([{ rawText: 'NL 209/219', confidence: 0.82 }]));
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
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'NL 209/219',
          region: 'bottom-right',
          setCode: 'UNL',
          correctedFromSetCode: 'NL',
          number: '209/219',
          key: 'UNL:209/219',
          status: 'resolved',
          match: { catalogCardId: 209, name: 'Dusk Rose Lab' },
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            region: 'bottom-right',
            rawText: 'NL 209/219',
            parsedAttempts: [
              {
                setCode: 'NL',
                number: '209/219',
                normalizedNumber: '209/219',
              },
            ],
          }),
        ],
      },
    });
  });

  it('does not correct a clipped set code when the OCR set code exists exactly', async () => {
    await register(mockOcr([{ rawText: 'NL 209/219', confidence: 0.82 }]));
    vi.mocked(db.select)
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([{ id: 55 }]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'NL 209/219',
          region: 'bottom-right',
          setCode: 'NL',
          number: '209/219',
          key: 'NL:209/219',
          status: 'unresolved',
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            parsedAttempts: [
              {
                setCode: 'NL',
                number: '209/219',
                normalizedNumber: '209/219',
              },
            ],
          }),
        ],
      },
    });
  });

  it('does not correct a clipped set code when suffix matches are ambiguous', async () => {
    await register(mockOcr([{ rawText: 'NL 209/219', confidence: 0.82 }]));
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
          {
            id: 999,
            productName: 'Other Lab',
            collectorNumber: '209/219',
            normalizedNumber: '209/219',
            photoUrl: null,
            set: { id: 2, setCode: 'XNL', name: 'Other Set' },
          },
        ]) as any,
      );

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'NL 209/219',
          region: 'bottom-right',
          setCode: 'NL',
          number: '209/219',
          key: 'NL:209/219',
          status: 'unresolved',
        },
      ],
    });
  });

  it('parses and resolves rotated-horizontal bottom-right battlefield IDs', async () => {
    await register(mockOcr([{ rawText: 'UNL • 002/219', confidence: 0.78 }]));
    mockCatalogRows([
      {
        id: 100,
        productName: 'Battlefield',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'UNL • 002/219',
          region: 'bottom-right',
          setCode: 'UNL',
          number: '002/219',
          key: 'UNL:2/219',
          status: 'resolved',
          match: { catalogCardId: 100, name: 'Battlefield' },
        },
      ],
      debug: {
        regions: [
          expect.objectContaining({
            region: 'bottom-right',
            rawText: 'UNL • 002/219',
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: '002/219',
                normalizedNumber: '2/219',
              },
            ],
          }),
        ],
      },
    });
  });

  it('parses and resolves vertical bottom-right battlefield IDs split over OCR lines', async () => {
    await register(
      mockOcr([{ rawText: 'U\nN\nL\n0\n0\n2\n/\n2\n1\n9', confidence: 0.64 }]),
    );
    mockCatalogRows([
      {
        id: 100,
        productName: 'Battlefield',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          rawText: 'U\nN\nL\n0\n0\n2\n/\n2\n1\n9',
          region: 'bottom-right',
          setCode: 'UNL',
          number: '002/219',
          key: 'UNL:2/219',
          status: 'resolved',
          match: { catalogCardId: 100, name: 'Battlefield' },
        },
      ],
      errors: [],
      debug: {
        regions: [
          expect.objectContaining({
            region: 'bottom-right',
            rawText: 'U\nN\nL\n0\n0\n2\n/\n2\n1\n9',
            parsedAttempts: [
              {
                setCode: 'UNL',
                number: '002/219',
                normalizedNumber: '2/219',
              },
            ],
          }),
        ],
      },
    });
  });

  it('returns ambiguous alternatives when multiple catalog cards match', async () => {
    await register(mockOcr([{ rawText: 'UNL-002/219', confidence: 0.72 }]));
    mockCatalogRows([
      {
        id: 100,
        productName: 'Inferna A',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
      {
        id: 101,
        productName: 'Inferna B',
        collectorNumber: '002/219',
        normalizedNumber: '2/219',
        photoUrl: null,
        set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-right', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      candidates: [
        {
          status: 'ambiguous',
          alternatives: [
            { catalogCardId: 100, name: 'Inferna A' },
            { catalogCardId: 101, name: 'Inferna B' },
          ],
        },
      ],
      errors: [],
    });
  });

  it('filters OCR text that cannot be parsed as a card identifier', async () => {
    await register(
      mockOcr([
        {
          rawText:
            'level page_num block_num par_num line_num word_num left top width height conf text 1 1 0 0 0 0',
          confidence: 0,
        },
      ]),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-left', dataUrl: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [],
      errors: [],
      debug: {
        regions: [
          {
            index: 0,
            region: 'bottom-left',
            rawText:
              'level page_num block_num par_num line_num word_num left top width height conf text 1 1 0 0 0 0',
            confidence: 0,
            parsedAttempts: [],
            errors: [],
          },
        ],
      },
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('handles multiple ROI images independently', async () => {
    await register(
      mockOcr([
        { rawText: 'UNL • 002/219', confidence: 0.9 },
        { rawText: 'UNL • 999/219', confidence: 0.4 },
      ]),
    );
    vi.mocked(db.select)
      .mockReturnValueOnce(
        queryRows([
          {
            id: 100,
            productName: 'Inferna',
            collectorNumber: '002/219',
            normalizedNumber: '2/219',
            photoUrl: null,
            set: { id: 1, setCode: 'UNL', name: 'Riftbound Origins' },
          },
        ]) as any,
      )
      .mockReturnValueOnce(queryRows([]) as any)
      .mockReturnValueOnce(queryRows([{ id: 1 }]) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [
          { region: 'bottom-left', dataUrl: pngDataUrl },
          { region: 'bottom-right', dataUrl: pngDataUrl },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0].status).toBe('resolved');
    expect(body.candidates[1]).toMatchObject({
      setCode: 'UNL',
      number: '999/219',
      status: 'unresolved',
    });
  });

  it('accepts the legacy frontend image field as a dataUrl alias', async () => {
    await register(mockOcr([{ rawText: 'UNL • 002/219', confidence: 0.88 }]));
    mockCatalogRows([]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'bottom-left', image: pngDataUrl }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).candidates[0]).toMatchObject({
      rawText: 'UNL • 002/219',
      status: 'unresolved',
    });
  });

  it('rejects malformed scanner recognition input safely', async () => {
    await register(mockOcr([]));

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [{ region: 'center', dataUrl: 'not-a-data-url' }],
      },
    });

    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [],
      errors: [
        'images[0].region must be bottom-left, bottom-left-strip, or bottom-right',
      ],
      debug: {
        regions: [
          {
            index: 0,
            region: 'center',
            rawText: '',
            confidence: 0,
            parsedAttempts: [],
            errors: [
              'images[0].region must be bottom-left, bottom-left-strip, or bottom-right',
            ],
          },
        ],
      },
    });
  });

  it('rejects oversized data URLs before OCR', async () => {
    const ocrService = mockOcr([]);
    await register(ocrService);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scanner/recognize',
      payload: {
        images: [
          {
            region: 'bottom-left',
            dataUrl: `data:image/png;base64,${'A'.repeat(1_500_000)}`,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(413);
    expect(ocrService.recognize).not.toHaveBeenCalled();
  });
});
