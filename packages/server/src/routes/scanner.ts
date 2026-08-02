import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { catalogCards, catalogSets } from '../db/schema/catalog.js';
import {
  normalizeSetCode,
  parseCatalogCodeAttempts,
  type ParsedCatalogCode,
} from '../lib/catalog/normalize.js';
import {
  extractScannerNameAttempts,
  resolveScannerOcrResult,
  type ScannerOcrRegion,
  type ScannerOcrResult,
} from '../lib/scanner/recognize.js';

const scannerRegionValues = [
  'bottom-left',
  'bottom-left-strip',
  'bottom-right',
] as const;
type ScannerRegion = (typeof scannerRegionValues)[number];

interface ResolveTextRequestBody {
  rawText?: unknown;
  region?: unknown;
  confidence?: unknown;
  setCodeHint?: unknown;
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

export async function scannerRoutes(fastify: FastifyInstance) {
  fastify.get('/status', async () => ({
    ocr: {
      engine: 'native-client',
      available: true,
      required: false,
    },
    catalog: await getCatalogReadiness(),
  }));

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
}
