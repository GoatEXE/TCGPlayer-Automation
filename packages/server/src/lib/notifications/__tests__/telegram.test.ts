import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../config/env.js';
import { sendNeedsAttentionAlert, sendTelegramMessage } from '../telegram.js';

describe('sendTelegramMessage', () => {
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalChatId = env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    vi.restoreAllMocks();
    (env as any).TELEGRAM_BOT_TOKEN = originalToken;
    (env as any).TELEGRAM_CHAT_ID = originalChatId;
  });

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
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalChatId = env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    vi.restoreAllMocks();
    (env as any).TELEGRAM_BOT_TOKEN = originalToken;
    (env as any).TELEGRAM_CHAT_ID = originalChatId;
  });

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
