import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { catalogCards, catalogSets } from '../db/schema/catalog.js';
import {
  normalizeSetCode,
  parseCatalogCodeAttempts,
  type ParsedCatalogCode,
} from '../lib/catalog/normalize.js';
import { decodeScannerImageDataUrl } from '../lib/scanner/data-url.js';
import {
  checkTesseractCliStatus,
  getDefaultScannerOcrService,
  type ScannerOcrRegion,
  type ScannerOcrResult,
  type ScannerOcrService,
} from '../lib/scanner/ocr.js';
import {
  extractScannerNameAttempts,
  resolveScannerOcrResult,
} from '../lib/scanner/recognize.js';

const scannerRegionValues = [
  'bottom-left',
  'bottom-left-strip',
  'bottom-right',
] as const;
type ScannerRegion = (typeof scannerRegionValues)[number];

interface RecognizeImageInput {
  region?: string;
  dataUrl?: string;
  image?: string;
}

interface RecognizeRequestBody {
  images?: RecognizeImageInput[];
}

interface ResolveTextRequestBody {
  rawText?: unknown;
  region?: unknown;
  confidence?: unknown;
  setCodeHint?: unknown;
}

interface ScannerRoutesOptions {
  ocrService?: ScannerOcrService;
}

interface ScannerRecognitionDebugRegion {
  index: number;
  region: string | null;
  rawText: string;
  confidence: number;
  parsedAttempts: ParsedCatalogCode[];
  nameAttempts?: string[];
  errors: string[];
}

const MAX_RAW_TEXT_LENGTH = 2_000;

function isScannerRegion(value: string | undefined): value is ScannerRegion {
  return scannerRegionValues.includes(value as ScannerRegion);
}

function getScannerImageDataUrl(
  image: RecognizeImageInput,
): string | undefined {
  return image.dataUrl ?? image.image;
}

function isResolveTextRegion(value: unknown): value is ScannerOcrRegion {
  return (
    value === undefined ||
    value === 'native' ||
    scannerRegionValues.includes(value as ScannerRegion)
  );
}

function normalizeResolveTextRegion(value: unknown): ScannerOcrRegion {
  return typeof value === 'string' ? (value as ScannerOcrRegion) : 'native';
}

function parseConfidence(value: unknown): number | null {
  if (value === undefined) {
    return 0;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function toDebugRegion(
  index: number,
  region: ScannerOcrRegion,
  result: ScannerOcrResult,
): ScannerRecognitionDebugRegion {
  const parsedAttempts = parseCatalogCodeAttempts(result.rawText);
  const nameAttempts =
    parsedAttempts.length === 0
      ? extractScannerNameAttempts(result.rawText)
      : [];

  return {
    index,
    region,
    rawText: result.rawText,
    confidence: result.confidence,
    parsedAttempts,
    ...(nameAttempts.length > 0 ? { nameAttempts } : {}),
    errors: [],
  };
}

function toCount(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getCatalogReadiness() {
  const [setStats] = await db
    .select({
      count: sql<number>`count(*)`,
      lastSyncedAt: sql<Date | null>`max(${catalogSets.syncedAt})`,
    })
    .from(catalogSets)
    .where(eq(catalogSets.productLine, 'Riftbound'));

  const [cardStats] = await db
    .select({
      count: sql<number>`count(*)`,
      lastSyncedAt: sql<Date | null>`max(${catalogCards.syncedAt})`,
    })
    .from(catalogCards)
    .innerJoin(catalogSets, eq(catalogCards.catalogSetId, catalogSets.id))
    .where(eq(catalogSets.productLine, 'Riftbound'));

  const cardCount = toCount(cardStats?.count);

  return {
    sets: toCount(setStats?.count),
    cards: cardCount,
    lastSyncedAt: cardStats?.lastSyncedAt ?? setStats?.lastSyncedAt ?? null,
    ready: cardCount > 0,
  };
}

export async function scannerRoutes(
  fastify: FastifyInstance,
  options: ScannerRoutesOptions = {},
) {
  fastify.get('/status', async () => {
    const [ocr, catalog] = await Promise.all([
      checkTesseractCliStatus(),
      getCatalogReadiness(),
    ]);

    return {
      ocr: {
        engine: 'tesseract-cli',
        ...ocr,
      },
      catalog,
    };
  });

  fastify.post('/resolve-text', async (request, reply) => {
    const body = (request.body || {}) as ResolveTextRequestBody;

    if (typeof body.rawText !== 'string') {
      return reply.code(400).send({ error: 'rawText must be a string' });
    }

    const rawText = body.rawText.trim();
    if (rawText === '') {
      return reply.code(400).send({ error: 'rawText must be non-empty' });
    }

    if (rawText.length > MAX_RAW_TEXT_LENGTH) {
      return reply.code(413).send({
        error: `rawText exceeds ${MAX_RAW_TEXT_LENGTH} character limit`,
      });
    }

    if (!isResolveTextRegion(body.region)) {
      return reply.code(400).send({
        error:
          'region must be native, bottom-left, bottom-left-strip, or bottom-right',
      });
    }

    const confidence = parseConfidence(body.confidence);
    if (confidence === null) {
      return reply
        .code(400)
        .send({ error: 'confidence must be a finite number' });
    }

    if (
      body.setCodeHint !== undefined &&
      (typeof body.setCodeHint !== 'string' || body.setCodeHint.trim() === '')
    ) {
      return reply.code(400).send({
        error: 'setCodeHint must be a non-empty string when provided',
      });
    }

    const region = normalizeResolveTextRegion(body.region);
    const ocrResult = { rawText, confidence };
    const setCodeHint =
      typeof body.setCodeHint === 'string'
        ? normalizeSetCode(body.setCodeHint)
        : undefined;
    const candidate = await resolveScannerOcrResult(ocrResult, region, 0, {
      setCodeHint,
    });

    return {
      candidates: candidate ? [candidate] : [],
      errors: [],
      debug: {
        regions: [toDebugRegion(0, region, ocrResult)],
      },
    };
  });

  fastify.post('/recognize', async (request, reply) => {
    const body = (request.body || {}) as RecognizeRequestBody;

    if (!Array.isArray(body.images)) {
      return reply.code(400).send({ error: 'images must be an array' });
    }

    if (body.images.length === 0) {
      return reply
        .code(400)
        .send({ error: 'images must be a non-empty array' });
    }

    if (body.images.length > 4) {
      return reply
        .code(413)
        .send({ error: 'a maximum of 4 images can be recognized at once' });
    }

    const ocrService = options.ocrService || getDefaultScannerOcrService();
    const errors: string[] = [];
    const candidates = [];
    const debugRegions: ScannerRecognitionDebugRegion[] = [];

    for (const [index, image] of body.images.entries()) {
      const debugRegion: ScannerRecognitionDebugRegion = {
        index,
        region: image.region ?? null,
        rawText: '',
        confidence: 0,
        parsedAttempts: [],
        errors: [],
      };
      debugRegions.push(debugRegion);

      if (!isScannerRegion(image.region)) {
        const message = `images[${index}].region must be bottom-left, bottom-left-strip, or bottom-right`;
        errors.push(message);
        debugRegion.errors.push(message);
        continue;
      }

      const dataUrl = getScannerImageDataUrl(image);

      if (typeof dataUrl !== 'string' || dataUrl.trim() === '') {
        const message = `images[${index}].dataUrl is required`;
        errors.push(message);
        debugRegion.errors.push(message);
        continue;
      }

      try {
        const decodedImage = decodeScannerImageDataUrl(dataUrl);
        const ocrResult = await ocrService.recognize({
          ...decodedImage,
          region: image.region,
        });
        const parsedAttempts = parseCatalogCodeAttempts(ocrResult.rawText);
        debugRegion.rawText = ocrResult.rawText;
        debugRegion.confidence = ocrResult.confidence;
        debugRegion.parsedAttempts = parsedAttempts;
        const nameAttempts =
          parsedAttempts.length === 0
            ? extractScannerNameAttempts(ocrResult.rawText)
            : [];
        if (nameAttempts.length > 0) {
          debugRegion.nameAttempts = nameAttempts;
        }

        const candidate = await resolveScannerOcrResult(
          ocrResult,
          image.region,
          index,
        );

        if (candidate) {
          candidates.push(candidate);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'recognition failed';
        errors.push(`images[${index}]: ${message}`);
        debugRegion.errors.push(message);
      }
    }

    return reply.code(errors.length > 0 ? 207 : 200).send({
      candidates,
      errors,
      debug: {
        regions: debugRegions,
      },
    });
  });
}
