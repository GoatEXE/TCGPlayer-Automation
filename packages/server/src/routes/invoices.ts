import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { sales } from '../db/schema/sales.js';
import { shipments } from '../db/schema/shipments.js';
import {
  renderInvoiceHtml,
  renderPackingSlipHtml,
  type InvoiceData,
  type PackingSlipData,
} from '../lib/invoices/index.js';

interface SaleDocumentRow {
  saleId: number;
  tcgplayerOrderId: string | null;
  buyerName: string | null;
  orderStatus: string;
  soldAt: Date;
  notes: string | null;
  quantitySold: number;
  salePriceCents: number;
  cardProductName: string | null;
  cardSetName: string | null;
  cardCondition: string | null;
  shipmentCarrier: string | null;
  shipmentTrackingNumber: string | null;
  shipmentShippedAt: Date | null;
  shipmentDeliveredAt: Date | null;
  shipmentNotes: string | null;
}

async function getSaleDocumentRows(saleId: number): Promise<SaleDocumentRow[]> {
  const [baseSale] = await db
    .select({
      id: sales.id,
      tcgplayerOrderId: sales.tcgplayerOrderId,
    })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);

  if (!baseSale) {
    return [];
  }

  let rowsQuery: any = db
    .select({
      saleId: sales.id,
      tcgplayerOrderId: sales.tcgplayerOrderId,
      buyerName: sales.buyerName,
      orderStatus: sales.orderStatus,
      soldAt: sales.soldAt,
      notes: sales.notes,
      quantitySold: sales.quantitySold,
      salePriceCents: sales.salePriceCents,
      cardProductName: cards.productName,
      cardSetName: cards.setName,
      cardCondition: cards.condition,
      shipmentCarrier: shipments.carrier,
      shipmentTrackingNumber: shipments.trackingNumber,
      shipmentShippedAt: shipments.shippedAt,
      shipmentDeliveredAt: shipments.deliveredAt,
      shipmentNotes: shipments.notes,
    })
    .from(sales)
    .leftJoin(cards, eq(sales.cardId, cards.id))
    .leftJoin(shipments, eq(shipments.saleId, sales.id));

  if (baseSale.tcgplayerOrderId) {
    rowsQuery = rowsQuery.where(
      eq(sales.tcgplayerOrderId, baseSale.tcgplayerOrderId),
    );
  } else {
    // Explicit null-order guard: only render the requested sale.
    rowsQuery = rowsQuery.where(eq(sales.id, saleId));
  }

  return rowsQuery;
}

function mapSharedDocumentData(
  rows: SaleDocumentRow[],
): Omit<InvoiceData, 'lineItems' | 'totalCents'> {
  const first = rows[0];

  const shipmentRow = rows.find(
    (row) =>
      row.shipmentCarrier !== null ||
      row.shipmentTrackingNumber !== null ||
      row.shipmentShippedAt !== null ||
      row.shipmentDeliveredAt !== null ||
      row.shipmentNotes !== null,
  );

  return {
    seller: {
      sellerName: env.SELLER_NAME,
      sellerId: env.SELLER_ID,
    },
    buyerName: first.buyerName,
    orderId: first.tcgplayerOrderId ?? `SALE-${first.saleId}`,
    orderStatus: first.orderStatus,
    soldAt: first.soldAt,
    shipment: shipmentRow
      ? {
          carrier: shipmentRow.shipmentCarrier,
          trackingNumber: shipmentRow.shipmentTrackingNumber,
          shippedAt: shipmentRow.shipmentShippedAt,
          deliveredAt: shipmentRow.shipmentDeliveredAt,
          notes: shipmentRow.shipmentNotes,
        }
      : null,
    notes: first.notes,
  };
}

function buildInvoiceData(rows: SaleDocumentRow[]): InvoiceData {
  const shared = mapSharedDocumentData(rows);
  const lineItems = rows.map((row) => ({
    description: row.cardProductName ?? 'Unknown Card',
    setName: row.cardSetName ?? '—',
    condition: row.cardCondition ?? '—',
    quantity: row.quantitySold,
    unitPriceCents:
      row.quantitySold > 0
        ? Math.round(row.salePriceCents / row.quantitySold)
        : row.salePriceCents,
    lineTotalCents: row.salePriceCents,
  }));

  return {
    ...shared,
    lineItems,
    totalCents: lineItems.reduce((sum, item) => sum + item.lineTotalCents, 0),
  };
}

function buildPackingSlipData(rows: SaleDocumentRow[]): PackingSlipData {
  const shared = mapSharedDocumentData(rows);
  return {
    ...shared,
    lineItems: rows.map((row) => ({
      description: row.cardProductName ?? 'Unknown Card',
      setName: row.cardSetName ?? '—',
      condition: row.cardCondition ?? '—',
      quantity: row.quantitySold,
    })),
  };
}

export async function invoiceRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    '/sales/:id/invoice',
    async (request, reply) => {
      const saleId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(saleId) || saleId <= 0) {
        return reply.code(400).send({ error: 'Invalid sale id' });
      }

      try {
        const rows = await getSaleDocumentRows(saleId);

        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Sale not found' });
        }

        return reply
          .type('text/html; charset=utf-8')
          .send(renderInvoiceHtml(buildInvoiceData(rows)));
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to render invoice' });
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/sales/:id/packing-slip',
    async (request, reply) => {
      const saleId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(saleId) || saleId <= 0) {
        return reply.code(400).send({ error: 'Invalid sale id' });
      }

      try {
        const rows = await getSaleDocumentRows(saleId);

        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Sale not found' });
        }

        return reply
          .type('text/html; charset=utf-8')
          .send(renderPackingSlipHtml(buildPackingSlipData(rows)));
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to render packing slip' });
      }
    },
  );
}
