export type RenderableDate = Date | string | null;

export interface InvoiceSeller {
  sellerName: string;
  sellerId?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  phone?: string | null;
}

export interface InvoiceShipment {
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: RenderableDate;
  deliveredAt?: RenderableDate;
  notes?: string | null;
}

export interface InvoiceLineItem {
  description: string;
  setName: string;
  condition: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface PackingSlipLineItem {
  description: string;
  setName: string;
  condition: string;
  quantity: number;
}

interface DocumentRenderData<TLineItem> {
  seller: InvoiceSeller;
  buyerName: string | null;
  buyerAddress?: string | null;
  orderId: string;
  orderStatus?: string | null;
  soldAt: RenderableDate;
  lineItems: TLineItem[];
  shipment?: InvoiceShipment | null;
  notes?: string | null;
}

export interface InvoiceData extends DocumentRenderData<InvoiceLineItem> {
  paymentMethod?: string | null;
  shippingCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
}

export interface PackingSlipData extends DocumentRenderData<PackingSlipLineItem> {}
