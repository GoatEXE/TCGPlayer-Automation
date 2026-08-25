import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { catalogCards, catalogSets } from '../../db/schema/catalog.js';

const PRODUCT_LINE = 'Riftbound';

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
