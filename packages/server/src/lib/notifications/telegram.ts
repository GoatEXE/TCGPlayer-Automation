import { env } from '../../config/env.js';
import type { NeedsAttentionCardAlert } from '../price-check/run-price-check.js';
import {
  recordNotificationEvent,
  type NotificationEventRecord,
} from './events.js';

export type NeedsAttentionAlertInput = NeedsAttentionCardAlert;

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

export interface TelegramNotificationEventMetadata {
  eventType: string;
  saleId?: number | null;
  cardId?: number | null;
  tcgplayerOrderId?: string | null;
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

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPriceOrDash(value: number | null): string {
  return value === null ? '—' : formatPrice(value);
}

function getNeedsAttentionPriceTransition(alert: NeedsAttentionAlertInput) {
  switch (alert.attentionReason) {
    case 'listed_price_drift':
      return {
        from: alert.currentListingPrice,
        to: alert.recommendedListingPrice,
      };
    case 'listed_below_threshold':
      return {
        from: alert.currentListingPrice,
        to: alert.recommendedListingPrice,
      };
    case 'listed_missing_price':
      return {
        from: alert.previousMarketPrice ?? alert.currentListingPrice,
        to: null,
      };
    default:
      return {
        from:
          alert.previousMarketPrice ??
          alert.currentListingPrice ??
          alert.recommendedListingPrice,
        to: alert.newMarketPrice,
      };
  }
}

function buildNeedsAttentionEntry(alert: NeedsAttentionAlertInput): string {
  const { from, to } = getNeedsAttentionPriceTransition(alert);
  const toDisplay =
    alert.attentionReason === 'listed_below_threshold' && to === null
      ? 'Gift'
      : formatPriceOrDash(to);

  return `• ${alert.displayName}: ${formatPriceOrDash(from)} → ${toDisplay}`;
}

export function buildNeedsAttentionAlertBatches(
  alerts: NeedsAttentionAlertInput[],
  maxLength = 3500,
): Array<{ message: string; historyIds: number[] }> {
  if (alerts.length === 0) {
    return [];
  }

  const baseHeaderLines = [
    `⚠️ Scheduled price check: ${alerts.length} card${alerts.length === 1 ? '' : 's'} need${alerts.length === 1 ? 's' : ''} attention`,
  ];

  const chunks: Array<{ entries: string[]; historyIds: number[] }> = [];
  let currentEntries: string[] = [];
  let currentHistoryIds: number[] = [];

  for (const alert of alerts) {
    const entry = buildNeedsAttentionEntry(alert);
    const candidateEntries = [...currentEntries, entry];
    const candidateMessage = [...baseHeaderLines, '', ...candidateEntries].join(
      '\n',
    );

    if (currentEntries.length > 0 && candidateMessage.length > maxLength) {
      chunks.push({ entries: currentEntries, historyIds: currentHistoryIds });
      currentEntries = [entry];
      currentHistoryIds = [alert.historyId];
      continue;
    }

    currentEntries = candidateEntries;
    currentHistoryIds = [...currentHistoryIds, alert.historyId];
  }

  if (currentEntries.length > 0) {
    chunks.push({ entries: currentEntries, historyIds: currentHistoryIds });
  }

  return chunks.map((chunk, index) => {
    const chunkHeaderLines = [...baseHeaderLines];
    if (chunks.length > 1) {
      chunkHeaderLines[0] = `${chunkHeaderLines[0]} (${index + 1}/${chunks.length})`;
    }

    return {
      message: [...chunkHeaderLines, '', ...chunk.entries].join('\n'),
      historyIds: chunk.historyIds,
    };
  });
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

async function recordTelegramNotificationEvent(
  metadata: TelegramNotificationEventMetadata | undefined,
  message: string,
  success: boolean,
  error?: string | null,
) {
  if (!metadata) {
    return;
  }

  const event: NotificationEventRecord = {
    channel: 'telegram',
    eventType: metadata.eventType,
    message,
    success,
    error: error ?? null,
    saleId: metadata.saleId ?? null,
    cardId: metadata.cardId ?? null,
    tcgplayerOrderId: metadata.tcgplayerOrderId ?? null,
  };

  await recordNotificationEvent(event);
}

export async function sendTelegramMessage(
  text: string,
  metadata?: TelegramNotificationEventMetadata,
): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    await recordTelegramNotificationEvent(
      metadata,
      text,
      false,
      'Telegram config missing',
    );
    return false;
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
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

    await recordTelegramNotificationEvent(metadata, text, true, null);
    return true;
  } catch (error) {
    await recordTelegramNotificationEvent(metadata, text, false, String(error));
    throw error;
  }
}

export async function sendNeedsAttentionAlert(
  alert: NeedsAttentionAlertInput,
): Promise<boolean> {
  const [batch] = buildNeedsAttentionAlertBatches([alert]);

  return sendTelegramMessage(batch.message, {
    eventType: 'needs_attention',
    cardId: alert.cardId,
  });
}

export async function sendSaleConfirmedAlert(
  input: SaleConfirmedAlertInput,
): Promise<boolean> {
  if (!env.TELEGRAM_NOTIFY_SALE_CONFIRMED) {
    return false;
  }

  const message = [
    '✅ Sale confirmed',
    ...buildSaleContextLines(input),
    `Sale ID: ${input.saleId}`,
  ].join('\n');

  return sendTelegramMessage(message, {
    eventType: 'sale_confirmed',
    saleId: input.saleId,
    cardId: input.cardId,
    tcgplayerOrderId: input.tcgplayerOrderId,
  });
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

  return sendTelegramMessage(lines.join('\n'), {
    eventType: 'order_shipped',
    saleId: input.saleId,
    cardId: input.cardId,
    tcgplayerOrderId: input.tcgplayerOrderId,
  });
}
