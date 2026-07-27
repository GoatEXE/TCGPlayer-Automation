import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { catalogCards, catalogSets } from '../../db/schema/catalog.js';

const PRODUCT_LINE = 'Riftbound';

export interface CatalogLookupResult {
  candidates: CatalogLookupCandidate[];
  setCode: string;
  correctedFromSetCode?: string;
}

export interface CatalogNameLookupResult {
  candidates: CatalogLookupCandidate[];
  name: string;
  normalizedName: string;
  setCodeHint?: string;
}

export interface CatalogLookupCandidate {
  id: number;
  tcgProductId: number | null;
  productName: string;
  title: string | null;
  collectorNumber: string | null;
  normalizedNumber: string | null;
  rarity: string | null;
  photoUrl: string | null;
  cardKind: string | null;
  set: {
    id: number;
    setCode: string;
    name: string;
  };
}

export function normalizeCatalogNameForLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedNameSql(column: unknown) {
  return sql<string>`btrim(regexp_replace(lower(${column}), '[^a-z0-9]+', ' ', 'g'))`;
}

function selectCatalogCandidatesQuery() {
  return db
    .select({
      id: catalogCards.id,
      tcgProductId: catalogCards.tcgProductId,
      productName: catalogCards.productName,
      title: catalogCards.title,
      collectorNumber: catalogCards.collectorNumber,
      normalizedNumber: catalogCards.normalizedNumber,
      rarity: catalogCards.rarity,
      photoUrl: catalogCards.photoUrl,
      cardKind: catalogCards.cardKind,
      set: {
        id: catalogSets.id,
        setCode: catalogSets.setCode,
        name: catalogSets.name,
      },
    })
    .from(catalogCards)
    .innerJoin(catalogSets, eq(catalogCards.catalogSetId, catalogSets.id));
}

export async function findCachedCatalogCandidates(
  setCode: string,
  normalizedNumber: string,
): Promise<CatalogLookupCandidate[]> {
  return selectCatalogCandidatesQuery()
    .where(
      and(
        eq(catalogSets.productLine, PRODUCT_LINE),
        eq(catalogSets.setCode, setCode),
        eq(catalogCards.normalizedNumber, normalizedNumber),
      ),
    )
    .orderBy(catalogCards.productName);
}

async function cachedCatalogSetExists(setCode: string): Promise<boolean> {
  const rows = await db
    .select({ id: catalogSets.id })
    .from(catalogSets)
    .where(
      and(
        eq(catalogSets.productLine, PRODUCT_LINE),
        eq(catalogSets.setCode, setCode),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  let differences = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return true;
}

function isPlausibleSetCodeCorrection(
  ocrSetCode: string,
  cachedSetCode: string,
): boolean {
  return (
    cachedSetCode.startsWith(ocrSetCode) ||
    cachedSetCode.endsWith(ocrSetCode) ||
    ocrSetCode.includes(cachedSetCode) ||
    editDistanceAtMostOne(ocrSetCode, cachedSetCode)
  );
}

async function findCachedCatalogCandidatesByCardNumber(
  normalizedNumber: string,
): Promise<CatalogLookupCandidate[]> {
  return selectCatalogCandidatesQuery()
    .where(
      and(
        eq(catalogSets.productLine, PRODUCT_LINE),
        eq(catalogCards.normalizedNumber, normalizedNumber),
      ),
    )
    .orderBy(catalogSets.setCode, catalogCards.productName);
}

function isTokenFaceNumber(normalizedNumber: string): boolean {
  return /^T\d{2,3}$/.test(normalizedNumber);
}

async function findCachedCatalogCandidatesByTokenFace(
  setCode: string,
  tokenFaceNumber: string,
): Promise<CatalogLookupCandidate[]> {
  return selectCatalogCandidatesQuery()
    .where(
      and(
        eq(catalogSets.productLine, PRODUCT_LINE),
        eq(catalogSets.setCode, setCode),
        or(
          eq(catalogCards.normalizedNumber, tokenFaceNumber),
          sql`${catalogCards.normalizedNumber} like ${`${tokenFaceNumber}//%`}`,
          sql`${catalogCards.normalizedNumber} like ${`%//${tokenFaceNumber}`}`,
        ),
      ),
    )
    .orderBy(catalogCards.productName);
}

export async function findCachedCatalogCandidatesByExactName(
  name: string,
  setCodeHint?: string,
): Promise<CatalogNameLookupResult> {
  const normalizedName = normalizeCatalogNameForLookup(name);

  if (normalizedName.length < 3) {
    return { candidates: [], name, normalizedName, setCodeHint };
  }

  const filters = [
    eq(catalogSets.productLine, PRODUCT_LINE),
    or(
      eq(normalizedNameSql(catalogCards.productName), normalizedName),
      eq(normalizedNameSql(catalogCards.title), normalizedName),
    ),
  ];

  if (setCodeHint) {
    filters.push(eq(catalogSets.setCode, setCodeHint));
  }

  const candidates = await selectCatalogCandidatesQuery()
    .where(and(...filters))
    .orderBy(catalogSets.setCode, catalogCards.productName);

  return { candidates, name, normalizedName, setCodeHint };
}

export async function findCachedCatalogCandidatesWithSetCodeCorrection(
  setCode: string,
  normalizedNumber: string,
): Promise<CatalogLookupResult> {
  const exactCandidates = await findCachedCatalogCandidates(
    setCode,
    normalizedNumber,
  );

  if (exactCandidates.length > 0) {
    return { candidates: exactCandidates, setCode };
  }

  if (isTokenFaceNumber(normalizedNumber)) {
    const tokenFaceCandidates = await findCachedCatalogCandidatesByTokenFace(
      setCode,
      normalizedNumber,
    );

    if (tokenFaceCandidates.length > 0) {
      return { candidates: tokenFaceCandidates, setCode };
    }
  }

  if (await cachedCatalogSetExists(setCode)) {
    return { candidates: [], setCode };
  }

  const correctionCandidates = (
    await findCachedCatalogCandidatesByCardNumber(normalizedNumber)
  ).filter((candidate) =>
    isPlausibleSetCodeCorrection(setCode, candidate.set.setCode),
  );
  const matchingSetCodes = [
    ...new Set(correctionCandidates.map((candidate) => candidate.set.setCode)),
  ];

  if (matchingSetCodes.length !== 1 || correctionCandidates.length !== 1) {
    return { candidates: [], setCode };
  }

  return {
    candidates: correctionCandidates,
    setCode: matchingSetCodes[0],
    correctedFromSetCode: setCode,
  };
}
