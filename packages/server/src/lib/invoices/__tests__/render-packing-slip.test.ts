import { describe, expect, it } from 'vitest';
import { renderPackingSlipHtml } from '../render-packing-slip.js';
import type { PackingSlipData } from '../types.js';

function makePackingSlipData(
  overrides: Partial<PackingSlipData> = {},
): PackingSlipData {
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
      },
    ],
    shipment: {
      carrier: 'USPS',
      trackingNumber: '9400111111111111111111',
      shippedAt: '2026-04-02T14:30:00.000Z',
      deliveredAt: null,
      notes: 'Packed in sleeve and top loader',
    },
    notes: 'Please leave feedback on TCGPlayer',
    ...overrides,
  };
}

describe('renderPackingSlipHtml', () => {
  it('renders packing slip details without any price columns or dollar values', () => {
    const html = renderPackingSlipHtml(makePackingSlipData());

    expect(html).toContain('<title>Packing Slip - Order #ORDER-123</title>');
    expect(html).toContain('Packing Slip');
    expect(html).toContain("Dustin's Card Shop");
    expect(html).toContain('Arcane Buyer');
    expect(html).toContain('Jinx - Demolitionist');
    expect(html).toContain('Origins');
    expect(html).toContain('Near Mint');
    expect(html).not.toContain('Unit Price');
    expect(html).not.toContain('Line Total');
    expect(html).not.toContain('$');
  });

  it('renders shipment details when present', () => {
    const html = renderPackingSlipHtml(makePackingSlipData());

    expect(html).toContain('Shipment Details');
    expect(html).toContain('USPS');
    expect(html).toContain('9400111111111111111111');
    expect(html).toContain('Packed in sleeve and top loader');
  });

  it('omits shipment details when no shipment exists', () => {
    const html = renderPackingSlipHtml(
      makePackingSlipData({
        shipment: null,
      }),
    );

    expect(html).not.toContain('Shipment Details');
  });

  it('uses a compact layout with only item, set, condition, and quantity columns', () => {
    const html = renderPackingSlipHtml(makePackingSlipData());

    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('<th>Set</th>');
    expect(html).toContain('<th>Condition</th>');
    expect(html).toContain('<th>Qty</th>');
    expect(html).not.toContain('<th>Unit Price</th>');
    expect(html).not.toContain('<th>Line Total</th>');
    expect(html).toContain('@media print');
  });
});
