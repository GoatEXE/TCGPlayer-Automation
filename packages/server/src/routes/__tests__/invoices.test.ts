import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { invoiceRoutes } from '../invoices.js';

vi.mock('../../config/env.js', () => ({
  env: {
    SELLER_NAME: "Dustin's Card Shop",
    SELLER_ID: 'dustin-cards',
  },
}));

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
}));

import { db } from '../../db/index.js';

function mockBaseSale(rows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as any);
}

function mockDocumentRows(rows: any[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  } as any);
}

function makeDocumentRow(overrides: Partial<any> = {}) {
  return {
    saleId: 10,
    tcgplayerOrderId: 'ORDER-123',
    buyerName: 'Arcane Buyer',
    orderStatus: 'shipped',
    soldAt: new Date('2026-04-01T07:00:00.000Z'),
    notes: 'Thank you for your purchase!',
    quantitySold: 2,
    salePriceCents: 250,
    cardProductName: 'Jinx - Demolitionist',
    cardSetName: 'Origins',
    cardCondition: 'Near Mint',
    shipmentCarrier: null,
    shipmentTrackingNumber: null,
    shipmentShippedAt: null,
    shipmentDeliveredAt: null,
    shipmentNotes: null,
    ...overrides,
  };
}

describe('invoice routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(invoiceRoutes, { prefix: '/api' });
  });

  describe('GET /api/sales/:id/invoice', () => {
    it('returns HTML with content-type text/html', async () => {
      mockBaseSale([{ id: 10, tcgplayerOrderId: 'ORDER-123' }]);
      mockDocumentRows([makeDocumentRow()]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/invoice',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain(
        '<title>Invoice - Order #ORDER-123</title>',
      );
    });

    it('includes seller, buyer, card, and price fields in invoice output', async () => {
      mockBaseSale([{ id: 10, tcgplayerOrderId: 'ORDER-123' }]);
      mockDocumentRows([makeDocumentRow()]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/invoice',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Dustin's Card Shop");
      expect(response.body).toContain('Arcane Buyer');
      expect(response.body).toContain('Jinx - Demolitionist');
      expect(response.body).toContain('$1.25');
      expect(response.body).toContain('$2.50');
    });

    it('groups line items for sales sharing the same tcgplayerOrderId', async () => {
      mockBaseSale([{ id: 10, tcgplayerOrderId: 'ORDER-123' }]);
      mockDocumentRows([
        makeDocumentRow(),
        makeDocumentRow({
          saleId: 11,
          quantitySold: 1,
          salePriceCents: 300,
          cardProductName: 'Vi - Piltover Enforcer',
        }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/invoice',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Jinx - Demolitionist');
      expect(response.body).toContain('Vi - Piltover Enforcer');
    });

    it('uses sale fallback order id when tcgplayerOrderId is null', async () => {
      mockBaseSale([{ id: 10, tcgplayerOrderId: null }]);
      mockDocumentRows([
        makeDocumentRow({
          saleId: 10,
          tcgplayerOrderId: null,
        }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/invoice',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Order #SALE-10');
      expect(response.body).not.toContain('Order #ORDER-123');
    });

    it('includes shipment details when a shipment exists', async () => {
      mockBaseSale([{ id: 10, tcgplayerOrderId: 'ORDER-123' }]);
      mockDocumentRows([
        makeDocumentRow({
          shipmentCarrier: 'USPS',
          shipmentTrackingNumber: '9400111111111111111111',
          shipmentShippedAt: new Date('2026-04-02T09:30:00.000Z'),
          shipmentNotes: 'Packed in sleeve and top loader',
        }),
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/invoice',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Shipment Details');
      expect(response.body).toContain('USPS');
      expect(response.body).toContain('9400111111111111111111');
      expect(response.body).toContain('Packed in sleeve and top loader');
    });

    it('returns 404 when sale is not found', async () => {
      mockBaseSale([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/999/invoice',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Sale not found' });
    });
  });

  describe('GET /api/sales/:id/packing-slip', () => {
    it('returns HTML without price fields or dollar values', async () => {
      mockBaseSale([{ id: 10, tcgplayerOrderId: 'ORDER-123' }]);
      mockDocumentRows([makeDocumentRow()]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/10/packing-slip',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain(
        '<title>Packing Slip - Order #ORDER-123</title>',
      );
      expect(response.body).toContain('Jinx - Demolitionist');
      expect(response.body).not.toContain('Unit Price');
      expect(response.body).not.toContain('Line Total');
      expect(response.body).not.toContain('$');
    });

    it('returns 404 when sale is not found', async () => {
      mockBaseSale([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sales/999/packing-slip',
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: 'Sale not found' });
    });
  });
});
