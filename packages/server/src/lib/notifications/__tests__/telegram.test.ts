import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../config/env.js';
import { sendTelegramMessage } from '../telegram.js';

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
