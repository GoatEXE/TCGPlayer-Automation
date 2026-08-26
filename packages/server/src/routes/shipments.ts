import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cards } from '../db/schema/cards.js';
import { shipments } from '../db/schema/shipments.js';
import { sendOrderShippedAlert } from '../lib/notifications/telegram.js';
import {
  OrderTransitionError,
  getOrderSaleRows,
  transitionOrderStatus,
} from '../lib/sales/order-status.js';

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

async function getShipmentById(database: any, shipmentId: number) {
  const [shipment] = await database
    .select()
    .from(shipments)
    .where(eq(shipments.id, shipmentId))
    .limit(1);

  return shipment;
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
        let representativeSale: any;
        let shipment: any;
        let shouldSendShippedAlert = false;

        await db.transaction(async (tx) => {
          const orderLines = await getOrderSaleRows(tx, saleId);
          if (orderLines.length === 0)
            throw new OrderTransitionError('Sale not found');
          const currentStatus = orderLines[0].orderStatus;
          if (!['confirmed', 'shipped'].includes(currentStatus)) {
            throw new OrderTransitionError(
              'Sale must be confirmed or shipped before recording shipment',
            );
          }
          if (orderLines.some((line) => line.orderStatus !== currentStatus)) {
            throw new OrderTransitionError(
              'Order lines have inconsistent statuses',
            );
          }

          representativeSale =
            orderLines.find((line) => line.id === saleId) ?? orderLines[0];
          const orderShipments = await tx
            .select()
            .from(shipments)
            .where(
              inArray(
                shipments.saleId,
                orderLines.map((line) => line.id),
              ),
            );
          if (
            orderShipments.some(
              (existingShipment) => !isShipmentPlaceholder(existingShipment),
            )
          ) {
            throw new OrderTransitionError(
              'Shipment already exists for this order',
            );
          }

          const placeholder =
            orderShipments.find(
              (existingShipment) =>
                existingShipment.saleId === saleId &&
                isShipmentPlaceholder(existingShipment),
            ) ?? orderShipments.find(isShipmentPlaceholder);
          if (placeholder) {
            [shipment] = await tx
              .update(shipments)
              .set({
                carrier: carrier ?? null,
                trackingNumber: trackingNumber ?? null,
                shippedAt: shippedAtDate,
                notes: notes ?? null,
                updatedAt: new Date(),
              })
              .where(eq(shipments.id, placeholder.id))
              .returning();
          } else {
            [shipment] = await tx
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

          if (currentStatus === 'confirmed') {
            await transitionOrderStatus(tx, orderLines, 'shipped');
          }
          shouldSendShippedAlert = !isShipmentPlaceholder(shipment);
        });

        if (shouldSendShippedAlert) {
          await sendOrderShippedAlertBestEffort(representativeSale, shipment);
        }
        return reply.code(201).send(shipment);
      } catch (error) {
        if (error instanceof OrderTransitionError) {
          const statusCode =
            error.message === 'Sale not found'
              ? 404
              : error.message === 'Shipment already exists for this order'
                ? 409
                : 400;
          return reply.code(statusCode).send({ error: error.message });
        }
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
        const orderLines = await getOrderSaleRows(db, saleId);
        if (orderLines.length === 0) {
          return reply.code(404).send({ error: 'Sale not found' });
        }
        const orderShipments = await db
          .select()
          .from(shipments)
          .where(
            inArray(
              shipments.saleId,
              orderLines.map((line) => line.id),
            ),
          );
        const shipment =
          orderShipments.find(
            (candidate) => !isShipmentPlaceholder(candidate),
          ) ?? orderShipments[0];
        if (!shipment)
          return reply.code(404).send({ error: 'Shipment not found' });
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
        let updatedShipment: any;
        await db.transaction(async (tx) => {
          const existingShipment = await getShipmentById(tx, shipmentId);
          if (!existingShipment)
            throw new OrderTransitionError('Shipment not found');

          [updatedShipment] = await tx
            .update(shipments)
            .set(updateData)
            .where(eq(shipments.id, shipmentId))
            .returning();
          if (!updatedShipment)
            throw new OrderTransitionError('Shipment not found');

          if (deliveredAtDate) {
            const orderLines = await getOrderSaleRows(
              tx,
              existingShipment.saleId,
            );
            if (orderLines.length === 0)
              throw new OrderTransitionError('Sale not found');
            if (orderLines[0].orderStatus === 'shipped') {
              await transitionOrderStatus(tx, orderLines, 'delivered');
            }
          }
        });
        return reply.send(updatedShipment);
      } catch (error) {
        if (error instanceof OrderTransitionError) {
          const statusCode = error.message === 'Shipment not found' ? 404 : 400;
          return reply.code(statusCode).send({ error: error.message });
        }
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to update shipment' });
      }
    },
  );
}
