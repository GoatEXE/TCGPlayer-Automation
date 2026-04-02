import { env } from '../../config/env.js';

export interface NeedsAttentionAlertInput {
  cardId: number;
  productName: string;
}

export interface SaleConfirmedAlertInput {
  saleId: number;
  productName?: string | null;
  cardId?: number | null;
  quantitySold: number;
  salePriceCents: number;
  buyerName?: string | null;
  tcgplayerOrderId?: string | null;
  orderLinkText?: string | null;
}

export interface OrderShippedAlertInput extends SaleConfirmedAlertInput {
  carrier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | Date | null;
}

function formatPriceFromCents(value: number): string {
  return `$${(value / 100).toFixed(2)}`;
}

function formatOptionalDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function buildSaleContextLines({
  productName,
  cardId,
  quantitySold,
  salePriceCents,
  buyerName,
  tcgplayerOrderId,
  orderLinkText,
}: SaleConfirmedAlertInput): string[] {
  const lines: string[] = [];

  if (productName) {
    lines.push(`Card: ${productName}`);
  } else if (cardId !== undefined && cardId !== null) {
    lines.push(`Card ID: ${cardId}`);
  }

  lines.push(`Quantity: ${quantitySold}`);
  lines.push(`Sale price: ${formatPriceFromCents(salePriceCents)}`);

  if (buyerName) {
    lines.push(`Buyer: ${buyerName}`);
  }

  if (tcgplayerOrderId) {
    lines.push(`Order ID: ${tcgplayerOrderId}`);
  }

  if (orderLinkText) {
    lines.push(`Order link: ${orderLinkText}`);
  }

  return lines;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return false;
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Telegram API error: ${response.status} ${response.statusText}`,
    );
  }

  return true;
}

export async function sendNeedsAttentionAlert({
  cardId,
  productName,
}: NeedsAttentionAlertInput): Promise<boolean> {
  return sendTelegramMessage(
    [
      '⚠️ Card needs attention',
      `Card ID: ${cardId}`,
      `Product: ${productName}`,
      'Reason: Market price not found during scheduled price check',
    ].join('\n'),
  );
}

export async function sendSaleConfirmedAlert(
  input: SaleConfirmedAlertInput,
): Promise<boolean> {
  if (!env.TELEGRAM_NOTIFY_SALE_CONFIRMED) {
    return false;
  }

  return sendTelegramMessage(
    [
      '✅ Sale confirmed',
      ...buildSaleContextLines(input),
      `Sale ID: ${input.saleId}`,
    ].join('\n'),
  );
}

export async function sendOrderShippedAlert(
  input: OrderShippedAlertInput,
): Promise<boolean> {
  if (!env.TELEGRAM_NOTIFY_ORDER_SHIPPED) {
    return false;
  }

  const lines = ['📦 Order shipped', ...buildSaleContextLines(input)];

  if (input.carrier) {
    lines.push(`Carrier: ${input.carrier}`);
  }

  if (input.trackingNumber) {
    lines.push(`Tracking: ${input.trackingNumber}`);
  }

  const shippedAt = formatOptionalDate(input.shippedAt);
  if (shippedAt) {
    lines.push(`Shipped at: ${shippedAt}`);
  }

  lines.push(`Sale ID: ${input.saleId}`);

  return sendTelegramMessage(lines.join('\n'));
}
