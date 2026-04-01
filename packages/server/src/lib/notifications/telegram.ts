import { env } from '../../config/env.js';

export interface NeedsAttentionAlertInput {
  cardId: number;
  productName: string;
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
