import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = process.env;

async function loadEnvModule() {
  vi.resetModules();
  return import('../env.js');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('env config', () => {
  it('defaults seller info env vars to empty strings when unset', async () => {
    const nextEnv = { ...ORIGINAL_ENV };
    delete nextEnv.SELLER_NAME;
    delete nextEnv.SELLER_ID;
    process.env = nextEnv;

    const { env } = await loadEnvModule();

    expect(env.SELLER_NAME).toBe('');
    expect(env.SELLER_ID).toBe('');
  });

  it('reads configured seller info env vars', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      SELLER_NAME: "Dustin's Card Shop",
      SELLER_ID: 'dustin-cards',
    };

    const { env } = await loadEnvModule();

    expect(env.SELLER_NAME).toBe("Dustin's Card Shop");
    expect(env.SELLER_ID).toBe('dustin-cards');
  });

  it('defaults telegram notification trigger flags to enabled', async () => {
    const nextEnv = { ...ORIGINAL_ENV };
    delete nextEnv.TELEGRAM_NOTIFY_SALE_CONFIRMED;
    delete nextEnv.TELEGRAM_NOTIFY_ORDER_SHIPPED;
    process.env = nextEnv;

    const { env } = await loadEnvModule();

    expect(env.TELEGRAM_NOTIFY_SALE_CONFIRMED).toBe(true);
    expect(env.TELEGRAM_NOTIFY_ORDER_SHIPPED).toBe(true);
  });

  it('reads configured telegram notification trigger flags', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      TELEGRAM_NOTIFY_SALE_CONFIRMED: 'false',
      TELEGRAM_NOTIFY_ORDER_SHIPPED: '0',
    };

    const { env } = await loadEnvModule();

    expect(env.TELEGRAM_NOTIFY_SALE_CONFIRMED).toBe(false);
    expect(env.TELEGRAM_NOTIFY_ORDER_SHIPPED).toBe(false);
  });

  it('defaults price check runtime settings when unset', async () => {
    const nextEnv = { ...ORIGINAL_ENV };
    delete nextEnv.PRICE_CHECK_INTERVAL_HOURS;
    delete nextEnv.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT;
    process.env = nextEnv;

    const { env } = await loadEnvModule();

    expect(env.PRICE_CHECK_INTERVAL_HOURS).toBe(12);
    expect(env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT).toBe(5);
  });

  it('reads configured listed price attention threshold', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT: '7.5',
    };

    const { env } = await loadEnvModule();

    expect(env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT).toBe(7.5);
  });
});
