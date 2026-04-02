import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { saleStatusHistory } from '../db/schema/sale-status-history.js';
import { sales } from '../db/schema/sales.js';
import { shipments } from '../db/schema/shipments.js';
import { sendOrderShippedAlert } from '../lib/notifications/telegram.js';
import { isValidTransition } from '../lib/sales/status-machine.js';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

interface CreateShipmentBody {
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string;
  notes?: string | null;
}

interface UpdateShipmentBody {
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isShipmentPlaceholder(shipment: {
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  notes: string | null;
}) {
  return (
    shipment.carrier === null &&
    shipment.trackingNumber === null &&
    shipment.shippedAt === null &&
    shipment.deliveredAt === null &&
    shipment.notes === null
  );
}

async function getSaleById(saleId: number) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);

  return sale;
}

async function getShipmentBySaleId(saleId: number) {
  const [shipment] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.saleId, saleId))
    .limit(1);

  return shipment;
}

async function getShipmentById(shipmentId: number) {
  const [shipment] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.id, shipmentId))
    .limit(1);

  return shipment;
}

async function autoTransitionSaleStatus(
  saleId: number,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
) {
  if (!isValidTransition(fromStatus, toStatus)) {
    return false;
  }

  const [updatedSale] = await db
    .update(sales)
    .set({
      orderStatus: toStatus,
      updatedAt: new Date(),
    })
    .where(eq(sales.id, saleId))
    .returning();

  if (!updatedSale) {
    return false;
  }

  await db.insert(saleStatusHistory).values({
    saleId,
    previousStatus: fromStatus,
    newStatus: toStatus,
    source: 'manual',
  });

  return true;
}

export async function shipmentsRoutes(fastify: FastifyInstance) {
  async function getCardProductName(cardId: number | null | undefined) {
    if (cardId === null || cardId === undefined) {
      return null;
    }

    const [card] = await db
      .select()
      .from(cards)
      .where(eq(cards.id, cardId))
      .limit(1);

    return card?.productName ?? null;
  }

  function buildOrderLinkText(tcgplayerOrderId: string | null) {
    if (!tcgplayerOrderId) {
      return undefined;
    }

    return 'Lookup in TCGplayer seller portal';
  }

  async function sendOrderShippedAlertBestEffort(
    sale: {
      id: number;
      cardId: number | null;
      quantitySold: number;
      salePriceCents: number;
      buyerName: string | null;
      tcgplayerOrderId: string | null;
    },
    shipment: {
      carrier: string | null;
      trackingNumber: string | null;
      shippedAt: Date | null;
    },
  ) {
    try {
      const productName = await getCardProductName(sale.cardId);

      await sendOrderShippedAlert({
        saleId: sale.id,
        cardId: sale.cardId,
        productName,
        quantitySold: sale.quantitySold,
        salePriceCents: sale.salePriceCents,
        buyerName: sale.buyerName,
        tcgplayerOrderId: sale.tcgplayerOrderId,
        orderLinkText: buildOrderLinkText(sale.tcgplayerOrderId),
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        shippedAt: shipment.shippedAt,
      });
    } catch (error) {
      fastify.log.error(
        `[shipments] order shipped telegram notification failed for saleId=${sale.id}: ${error}`,
      );
    }
  }

  fastify.post<{ Params: { id: string }; Body: CreateShipmentBody }>(
    '/sales/:id/ship',
    async (request, reply) => {
      const saleId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(saleId) || saleId <= 0) {
        return reply.code(400).send({ error: 'Invalid sale id' });
      }

      const { carrier, trackingNumber, shippedAt, notes } = request.body ?? {};

      const shippedAtDate = shippedAt ? parseDate(shippedAt) : null;
      if (shippedAt !== undefined && !shippedAtDate) {
        return reply.code(400).send({ error: 'Invalid shippedAt date' });
      }

      try {
        const sale = await getSaleById(saleId);
        if (!sale) {
          return reply.code(404).send({ error: 'Sale not found' });
        }

        if (!['confirmed', 'shipped'].includes(sale.orderStatus)) {
          return reply.code(400).send({
            error:
              'Sale must be confirmed or shipped before recording shipment',
          });
        }

        const existingShipment = await getShipmentBySaleId(saleId);

        let shipment;
        if (existingShipment) {
          if (!isShipmentPlaceholder(existingShipment)) {
            return reply.code(409).send({
              error: 'Shipment already exists for this sale',
            });
          }

          [shipment] = await db
            .update(shipments)
            .set({
              carrier: carrier ?? null,
              trackingNumber: trackingNumber ?? null,
              shippedAt: shippedAtDate,
              notes: notes ?? null,
              updatedAt: new Date(),
            })
            .where(eq(shipments.id, existingShipment.id))
            .returning();
        } else {
          [shipment] = await db
            .insert(shipments)
            .values({
              saleId,
              carrier: carrier ?? null,
              trackingNumber: trackingNumber ?? null,
              shippedAt: shippedAtDate,
              notes: notes ?? null,
              updatedAt: new Date(),
            })
            .returning();
        }

        let shouldSendShippedAlert = sale.orderStatus === 'shipped';

        if (sale.orderStatus === 'confirmed') {
          shouldSendShippedAlert = await autoTransitionSaleStatus(
            sale.id,
            sale.orderStatus,
            'shipped',
          );
        }

        if (shouldSendShippedAlert) {
          await sendOrderShippedAlertBestEffort(
            {
              id: sale.id,
              cardId: sale.cardId,
              quantitySold: sale.quantitySold,
              salePriceCents: sale.salePriceCents,
              buyerName: sale.buyerName,
              tcgplayerOrderId: sale.tcgplayerOrderId,
            },
            {
              carrier: shipment.carrier,
              trackingNumber: shipment.trackingNumber,
              shippedAt: shipment.shippedAt,
            },
          );
        }

        return reply.code(201).send(shipment);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to record shipment' });
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/sales/:id/shipment',
    async (request, reply) => {
      const saleId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(saleId) || saleId <= 0) {
        return reply.code(400).send({ error: 'Invalid sale id' });
      }

      try {
        const shipment = await getShipmentBySaleId(saleId);
        if (!shipment) {
          return reply.code(404).send({ error: 'Shipment not found' });
        }

        return reply.send(shipment);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to fetch shipment' });
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateShipmentBody }>(
    '/shipments/:id',
    async (request, reply) => {
      const shipmentId = Number.parseInt(request.params.id, 10);
      if (Number.isNaN(shipmentId) || shipmentId <= 0) {
        return reply.code(400).send({ error: 'Invalid shipment id' });
      }

      const { carrier, trackingNumber, shippedAt, deliveredAt, notes } =
        request.body ?? {};

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (carrier !== undefined) {
        updateData.carrier = carrier;
      }

      if (trackingNumber !== undefined) {
        updateData.trackingNumber = trackingNumber;
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      if (shippedAt !== undefined) {
        if (shippedAt === null) {
          updateData.shippedAt = null;
        } else {
          const shippedAtDate = parseDate(shippedAt);
          if (!shippedAtDate) {
            return reply.code(400).send({ error: 'Invalid shippedAt date' });
          }
          updateData.shippedAt = shippedAtDate;
        }
      }

      let deliveredAtDate: Date | null | undefined;
      if (deliveredAt !== undefined) {
        if (deliveredAt === null) {
          deliveredAtDate = null;
          updateData.deliveredAt = null;
        } else {
          deliveredAtDate = parseDate(deliveredAt);
          if (!deliveredAtDate) {
            return reply.code(400).send({ error: 'Invalid deliveredAt date' });
          }
          updateData.deliveredAt = deliveredAtDate;
        }
      }

      if (Object.keys(updateData).length === 1) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      try {
        const existingShipment = await getShipmentById(shipmentId);
        if (!existingShipment) {
          return reply.code(404).send({ error: 'Shipment not found' });
        }

        const [updatedShipment] = await db
          .update(shipments)
          .set(updateData)
          .where(eq(shipments.id, shipmentId))
          .returning();

        if (!updatedShipment) {
          return reply.code(404).send({ error: 'Shipment not found' });
        }

        if (deliveredAtDate) {
          const sale = await getSaleById(existingShipment.saleId);
          if (
            sale &&
            sale.orderStatus === 'shipped' &&
            isValidTransition(sale.orderStatus, 'delivered')
          ) {
            await autoTransitionSaleStatus(
              sale.id,
              sale.orderStatus,
              'delivered',
            );
          }
        }

        return reply.send(updatedShipment);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update shipment' });
      }
    },
  );
}
