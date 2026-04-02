import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../config/env.js';
import {
  sendNeedsAttentionAlert,
  sendOrderShippedAlert,
  sendSaleConfirmedAlert,
  sendTelegramMessage,
} from '../telegram.js';

const originalToken = env.TELEGRAM_BOT_TOKEN;
const originalChatId = env.TELEGRAM_CHAT_ID;
const originalSaleConfirmedFlag = env.TELEGRAM_NOTIFY_SALE_CONFIRMED;
const originalOrderShippedFlag = env.TELEGRAM_NOTIFY_ORDER_SHIPPED;

afterEach(() => {
  vi.restoreAllMocks();
  (env as any).TELEGRAM_BOT_TOKEN = originalToken;
  (env as any).TELEGRAM_CHAT_ID = originalChatId;
  (env as any).TELEGRAM_NOTIFY_SALE_CONFIRMED = originalSaleConfirmedFlag;
  (env as any).TELEGRAM_NOTIFY_ORDER_SHIPPED = originalOrderShippedFlag;
});

describe('sendTelegramMessage', () => {
  it('returns false when telegram config is missing', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = undefined;
    (env as any).TELEGRAM_CHAT_ID = undefined;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendTelegramMessage('hello');

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to telegram api when config is present', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendTelegramMessage('price alert');

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});

describe('sendNeedsAttentionAlert', () => {
  it('uses the same env gating as generic telegram sends', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = undefined;
    (env as any).TELEGRAM_CHAT_ID = undefined;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendNeedsAttentionAlert({
      cardId: 42,
      productName: 'Jinx',
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('formats the per-card needs_attention alert message', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendNeedsAttentionAlert({
      cardId: 42,
      productName: 'Jinx',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat-id',
          text: [
            '⚠️ Card needs attention',
            'Card ID: 42',
            'Product: Jinx',
            'Reason: Market price not found during scheduled price check',
          ].join('\n'),
          disable_web_page_preview: true,
        }),
      }),
    );
  });
});

describe('sendSaleConfirmedAlert', () => {
  it('returns false when sale confirmed notifications are disabled', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';
    (env as any).TELEGRAM_NOTIFY_SALE_CONFIRMED = false;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendSaleConfirmedAlert({
      saleId: 101,
      productName: 'Jinx',
      quantitySold: 2,
      salePriceCents: 450,
      buyerName: 'Buyer One',
      tcgplayerOrderId: 'ORDER-101',
      orderLinkText: 'Lookup in seller portal',
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('formats the sale confirmed alert message with richer order context', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';
    (env as any).TELEGRAM_NOTIFY_SALE_CONFIRMED = true;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendSaleConfirmedAlert({
      saleId: 101,
      productName: 'Jinx',
      quantitySold: 2,
      salePriceCents: 450,
      buyerName: 'Buyer One',
      tcgplayerOrderId: 'ORDER-101',
      orderLinkText: 'Lookup in seller portal',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat-id',
          text: [
            '✅ Sale confirmed',
            'Card: Jinx',
            'Quantity: 2',
            'Sale price: $4.50',
            'Buyer: Buyer One',
            'Order ID: ORDER-101',
            'Order link: Lookup in seller portal',
            'Sale ID: 101',
          ].join('\n'),
          disable_web_page_preview: true,
        }),
      }),
    );
  });

  it('falls back gracefully when optional sale fields are missing', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';
    (env as any).TELEGRAM_NOTIFY_SALE_CONFIRMED = true;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendSaleConfirmedAlert({
      saleId: 102,
      cardId: 77,
      quantitySold: 1,
      salePriceCents: 99,
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat-id',
          text: [
            '✅ Sale confirmed',
            'Card ID: 77',
            'Quantity: 1',
            'Sale price: $0.99',
            'Sale ID: 102',
          ].join('\n'),
          disable_web_page_preview: true,
        }),
      }),
    );
  });
});

describe('sendOrderShippedAlert', () => {
  it('returns false when order shipped notifications are disabled', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';
    (env as any).TELEGRAM_NOTIFY_ORDER_SHIPPED = false;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendOrderShippedAlert({
      saleId: 202,
      productName: 'Lux',
      quantitySold: 1,
      salePriceCents: 325,
      buyerName: 'Buyer Two',
      tcgplayerOrderId: 'ORDER-202',
      orderLinkText: 'Lookup in seller portal',
      carrier: 'USPS',
      trackingNumber: '9400',
      shippedAt: '2026-04-02T10:30:00.000Z',
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('formats the order shipped alert message', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';
    (env as any).TELEGRAM_NOTIFY_ORDER_SHIPPED = true;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendOrderShippedAlert({
      saleId: 202,
      productName: 'Lux',
      quantitySold: 1,
      salePriceCents: 325,
      buyerName: 'Buyer Two',
      tcgplayerOrderId: 'ORDER-202',
      orderLinkText: 'Lookup in seller portal',
      carrier: 'USPS',
      trackingNumber: '9400',
      shippedAt: '2026-04-02T10:30:00.000Z',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat-id',
          text: [
            '📦 Order shipped',
            'Card: Lux',
            'Quantity: 1',
            'Sale price: $3.25',
            'Buyer: Buyer Two',
            'Order ID: ORDER-202',
            'Order link: Lookup in seller portal',
            'Carrier: USPS',
            'Tracking: 9400',
            'Shipped at: 2026-04-02T10:30:00.000Z',
            'Sale ID: 202',
          ].join('\n'),
          disable_web_page_preview: true,
        }),
      }),
    );
  });

  it('omits missing optional shipment fields while keeping fallback identifiers', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';
    (env as any).TELEGRAM_NOTIFY_ORDER_SHIPPED = true;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendOrderShippedAlert({
      saleId: 203,
      cardId: 88,
      quantitySold: 3,
      salePriceCents: 150,
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat-id',
          text: [
            '📦 Order shipped',
            'Card ID: 88',
            'Quantity: 3',
            'Sale price: $1.50',
            'Sale ID: 203',
          ].join('\n'),
          disable_web_page_preview: true,
        }),
      }),
    );
  });
});
