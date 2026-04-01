import { eq } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { shipments } from '../../db/schema/shipments.js';

/**
 * Idempotently create a shipment placeholder when a sale transitions to `confirmed`.
 *
 * Uses `ON CONFLICT DO NOTHING` on the unique `sale_id` constraint so calling
 * this multiple times for the same sale is safe (no-op on duplicates).
 *
 * Returns the shipment row (newly created or existing).
 */
export async function createShipmentOnConfirm(
  database: Database,
  saleId: number,
) {
  // Attempt insert; silently skip if a shipment already exists for this sale.
  const [inserted] = await database
    .insert(shipments)
    .values({ saleId })
    .onConflictDoNothing({ target: shipments.saleId })
    .returning();

  if (inserted) {
    return inserted;
  }

  // Already existed — return the existing row.
  const [existing] = await database
    .select()
    .from(shipments)
    .where(eq(shipments.saleId, saleId))
    .limit(1);

  return existing;
}
