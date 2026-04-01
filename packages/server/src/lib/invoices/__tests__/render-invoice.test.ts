import { describe, expect, it } from 'vitest';
import { renderInvoiceHtml } from '../render-invoice.js';
import type { InvoiceData } from '../types.js';

function makeInvoiceData(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    seller: {
      sellerName: "Dustin's Card Shop",
      sellerId: 'dustin-cards',
    },
    buyerName: 'Arcane Buyer',
    orderId: 'ORDER-123',
    orderStatus: 'shipped',
    soldAt: '2026-04-01T12:00:00.000Z',
    lineItems: [
      {
        description: 'Jinx - Demolitionist',
        setName: 'Origins',
        condition: 'Near Mint',
        quantity: 2,
        unitPriceCents: 125,
        lineTotalCents: 250,
      },
    ],
    shipment: {
      carrier: 'USPS',
      trackingNumber: '9400111111111111111111',
      shippedAt: '2026-04-02T14:30:00.000Z',
      deliveredAt: null,
      notes: 'Packed in sleeve and top loader',
    },
    notes: 'Thank you for your purchase!',
    ...overrides,
  };
}

describe('renderInvoiceHtml', () => {
  it('renders an invoice with populated seller, buyer, order, shipment, and line item fields', () => {
    const html = renderInvoiceHtml(makeInvoiceData());

    expect(html).toContain('<title>Invoice - Order #ORDER-123</title>');
    expect(html).toContain('Invoice');
    expect(html).toContain("Dustin's Card Shop");
    expect(html).toContain('dustin-cards');
    expect(html).toContain('Arcane Buyer');
    expect(html).toContain('ORDER-123');
    expect(html).toContain('shipped');
    expect(html).toContain('Jinx - Demolitionist');
    expect(html).toContain('Origins');
    expect(html).toContain('Near Mint');
    expect(html).toContain('USPS');
    expect(html).toContain('9400111111111111111111');
    expect(html).toContain('Packed in sleeve and top loader');
    expect(html).toContain('Thank you for your purchase!');
  });

  it('renders gracefully when optional buyer, shipment, seller id, and notes are missing', () => {
    const html = renderInvoiceHtml(
      makeInvoiceData({
        seller: {
          sellerName: 'Solo Seller',
          sellerId: '',
        },
        buyerName: null,
        shipment: null,
        notes: null,
      }),
    );

    expect(html).toContain('Solo Seller');
    expect(html).toContain('Buyer</dt>');
    expect(html).toContain('<dd>—</dd>');
    expect(html).not.toContain('Shipment Details');
    expect(html).not.toContain('Additional Notes');
  });

  it('renders multiple line items and correct subtotal/total values', () => {
    const html = renderInvoiceHtml(
      makeInvoiceData({
        lineItems: [
          {
            description: 'Jinx - Demolitionist',
            setName: 'Origins',
            condition: 'Near Mint',
            quantity: 2,
            unitPriceCents: 125,
            lineTotalCents: 250,
          },
          {
            description: 'Vi - Piltover Enforcer',
            setName: 'Origins',
            condition: 'Lightly Played',
            quantity: 1,
            unitPriceCents: 500,
            lineTotalCents: 500,
          },
        ],
      }),
    );

    expect(html).toContain('Jinx - Demolitionist');
    expect(html).toContain('Vi - Piltover Enforcer');
    expect(html).toContain('$2.50');
    expect(html).toContain('$5.00');
    expect(html).toContain('$7.50');
  });

  it('formats cents as dollars in unit price and line total columns', () => {
    const html = renderInvoiceHtml(
      makeInvoiceData({
        lineItems: [
          {
            description: 'Pow-Pow',
            setName: 'Origins',
            condition: 'Near Mint',
            quantity: 1,
            unitPriceCents: 199,
            lineTotalCents: 199,
          },
        ],
      }),
    );

    expect(html).toContain('$1.99');
    expect(html).not.toContain('>199<');
  });

  it('includes print CSS for browser printing', () => {
    const html = renderInvoiceHtml(makeInvoiceData());

    expect(html).toContain('@media print');
  });

  it('hides the seller block when sellerName is empty', () => {
    const html = renderInvoiceHtml(
      makeInvoiceData({
        seller: {
          sellerName: '',
          sellerId: 'hidden-id',
        },
      }),
    );

    expect(html).not.toContain('Seller Information');
    expect(html).not.toContain('hidden-id');
  });
});
