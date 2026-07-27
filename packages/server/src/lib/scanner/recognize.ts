import {
  findCachedCatalogCandidates,
  findCachedCatalogCandidatesByExactName,
  findCachedCatalogCandidatesWithSetCodeCorrection,
  normalizeCatalogNameForLookup,
} from '../catalog/lookup.js';
import { parseCatalogCodeAttempts } from '../catalog/normalize.js';
import type { ScannerOcrRegion, ScannerOcrResult } from './ocr.js';

export type ScannerRecognitionStatus = 'resolved' | 'ambiguous' | 'unresolved';

export interface ScannerTextResolutionOptions {
  setCodeHint?: string;
}

export interface ScannerRecognitionCandidate {
  rawText: string;
  region: ScannerOcrRegion;
  setCode: string | null;
  number: string | null;
  key: string;
  status: ScannerRecognitionStatus;
  confidence: number;
  correctedFromSetCode?: string;
  resolvedBy?: 'catalogCode' | 'name';
  nameAttempt?: string;
  ambiguityReason?:
    | 'multipleCatalogMatches'
    | 'tokenFaceMatchesMultipleProducts';
  match?: {
    catalogCardId: number;
    name: string;
    setCode: string;
    number: string;
    imageUrl?: string;
  };
  alternatives?: Array<{
    catalogCardId: number;
    name: string;
    setCode: string;
    number: string;
    imageUrl?: string;
  }>;
}

function scannerNameAttemptSources(rawText: string): string[] {
  return rawText
    .split(/[\r\n/|•·:;]+/)
    .flatMap((part) => [part, part.replace(/^\s*\d{1,2}\s+/, '')]);
}

export function extractScannerNameAttempts(rawText: string): string[] {
  const seen = new Set<string>();
  const attempts: string[] = [];

  for (const source of scannerNameAttemptSources(rawText)) {
    const cleaned = source
      .trim()
      .replace(/^[^A-Za-z]+/, '')
      .replace(/[^A-Za-z0-9' -]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const normalized = normalizeCatalogNameForLookup(cleaned);

    if (
      normalized.length < 3 ||
      normalized.length > 60 ||
      !/[a-z]/.test(normalized) ||
      /\d/.test(normalized) ||
      cleaned.includes('/') ||
      normalized.split(' ').length > 5 ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    attempts.push(cleaned);

    if (attempts.length >= 8) {
      break;
    }
  }

  return attempts;
}

function isTokenFaceNumber(normalizedNumber: string): boolean {
  return /^T\d{2,3}$/.test(normalizedNumber);
}

function toMatch(
  candidate: Awaited<ReturnType<typeof findCachedCatalogCandidates>>[number],
) {
  return {
    catalogCardId: candidate.id,
    name: candidate.productName,
    setCode: candidate.set.setCode,
    number: candidate.collectorNumber || candidate.normalizedNumber || '',
    ...(candidate.photoUrl ? { imageUrl: candidate.photoUrl } : {}),
  };
}

async function resolveScannerNameResult(
  result: ScannerOcrResult,
  region: ScannerOcrRegion,
  options: ScannerTextResolutionOptions = {},
): Promise<ScannerRecognitionCandidate | null> {
  let bestCandidate: ScannerRecognitionCandidate | null = null;

  for (const nameAttempt of extractScannerNameAttempts(result.rawText)) {
    const lookup = await findCachedCatalogCandidatesByExactName(
      nameAttempt,
      options.setCodeHint,
    );
    const { candidates } = lookup;

    if (candidates.length === 0) {
      continue;
    }

    const status: ScannerRecognitionStatus =
      candidates.length === 1 ? 'resolved' : 'ambiguous';
    const matched = candidates[0];
    const candidate: ScannerRecognitionCandidate = {
      rawText: result.rawText,
      region,
      setCode: status === 'resolved' ? matched.set.setCode : null,
      number:
        status === 'resolved'
          ? matched.collectorNumber || matched.normalizedNumber || null
          : null,
      key:
        status === 'resolved'
          ? `catalog:${matched.id}`
          : `name:${lookup.normalizedName}`,
      status,
      confidence: result.confidence,
      resolvedBy: 'name',
      nameAttempt,
      ...(status === 'resolved' ? { match: toMatch(matched) } : {}),
      ...(status === 'ambiguous'
        ? {
            ambiguityReason: 'multipleCatalogMatches' as const,
            alternatives: candidates.map((catalogCandidate) =>
              toMatch(catalogCandidate),
            ),
          }
        : {}),
    };

    if (candidate.status === 'resolved') {
      return candidate;
    }

    bestCandidate ??= candidate;
  }

  return bestCandidate;
}

export async function resolveScannerOcrResult(
  result: ScannerOcrResult,
  region: ScannerOcrRegion,
  _index: number,
  options: ScannerTextResolutionOptions = {},
): Promise<ScannerRecognitionCandidate | null> {
  const attempts = parseCatalogCodeAttempts(result.rawText);

  if (attempts.length === 0) {
    return resolveScannerNameResult(result, region, options);
  }

  let bestCandidate: ScannerRecognitionCandidate | null = null;

  for (const parsed of attempts) {
    const lookup = await findCachedCatalogCandidatesWithSetCodeCorrection(
      parsed.setCode,
      parsed.normalizedNumber,
    );
    const { candidates } = lookup;
    const status: ScannerRecognitionStatus =
      candidates.length === 1
        ? 'resolved'
        : candidates.length > 1
          ? 'ambiguous'
          : 'unresolved';
    const key = `${lookup.setCode}:${parsed.normalizedNumber}`;
    const candidate: ScannerRecognitionCandidate = {
      rawText: result.rawText,
      region,
      setCode: lookup.setCode,
      number: parsed.number,
      key,
      status,
      confidence: result.confidence,
      resolvedBy: 'catalogCode',
      ...(lookup.correctedFromSetCode
        ? { correctedFromSetCode: lookup.correctedFromSetCode }
        : {}),
      ...(status === 'resolved' ? { match: toMatch(candidates[0]) } : {}),
      ...(status === 'ambiguous'
        ? {
            ambiguityReason: isTokenFaceNumber(parsed.normalizedNumber)
              ? ('tokenFaceMatchesMultipleProducts' as const)
              : ('multipleCatalogMatches' as const),
            alternatives: candidates.map((catalogCandidate) =>
              toMatch(catalogCandidate),
            ),
          }
        : {}),
    };

    if (candidate.status === 'resolved') {
      return candidate;
    }

    if (
      candidate.status === 'ambiguous' &&
      bestCandidate?.status !== 'ambiguous'
    ) {
      bestCandidate = candidate;
      continue;
    }

    bestCandidate ??= candidate;
  }

  return bestCandidate;
}
