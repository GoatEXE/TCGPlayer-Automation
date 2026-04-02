import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
}));

vi.mock('../../../db/index.js', () => ({
  db: {
    insert: dbMocks.insert,
  },
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.insert.mockReturnValue({
    values: dbMocks.values,
  });
  dbMocks.values.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  (env as any).TELEGRAM_BOT_TOKEN = originalToken;
  (env as any).TELEGRAM_CHAT_ID = originalChatId;
  (env as any).TELEGRAM_NOTIFY_SALE_CONFIRMED = originalSaleConfirmedFlag;
  (env as any).TELEGRAM_NOTIFY_ORDER_SHIPPED = originalOrderShippedFlag;
});

describe('sendTelegramMessage', () => {
  it('returns false and logs an unsuccessful event when telegram config is missing', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = undefined;
    (env as any).TELEGRAM_CHAT_ID = undefined;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendTelegramMessage('hello', {
      eventType: 'price_check_summary',
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMocks.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        eventType: 'price_check_summary',
        message: 'hello',
        success: false,
        error: 'Telegram config missing',
      }),
    );
  });

  it('posts to telegram api and logs a successful event when config is present', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);

    const result = await sendTelegramMessage('price alert', {
      eventType: 'price_check_summary',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        eventType: 'price_check_summary',
        message: 'price alert',
        success: true,
        error: null,
      }),
    );
  });

  it('logs a failed event and rethrows when telegram send fails', async () => {
    (env as any).TELEGRAM_BOT_TOKEN = 'bot-token';
    (env as any).TELEGRAM_CHAT_ID = 'chat-id';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('telegram down'),
    );

    await expect(
      sendTelegramMessage('price alert', {
        eventType: 'price_check_failed',
      }),
    ).rejects.toThrow('telegram down');

    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        eventType: 'price_check_failed',
        message: 'price alert',
        success: false,
        error: 'Error: telegram down',
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
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'needs_attention',
        cardId: 42,
        success: false,
      }),
    );
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
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'needs_attention',
        cardId: 42,
        success: true,
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
      cardId: 55,
      quantitySold: 2,
      salePriceCents: 450,
      buyerName: 'Buyer One',
      tcgplayerOrderId: 'ORDER-101',
      orderLinkText: 'Lookup in seller portal',
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('formats the sale confirmed alert message with richer order context and logs the event', async () => {
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
      cardId: 55,
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
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sale_confirmed',
        saleId: 101,
        cardId: 55,
        tcgplayerOrderId: 'ORDER-101',
        success: true,
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
      cardId: 88,
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
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('formats the order shipped alert message and logs the event', async () => {
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
      cardId: 88,
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
    expect(dbMocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'order_shipped',
        saleId: 202,
        cardId: 88,
        tcgplayerOrderId: 'ORDER-202',
        success: true,
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
