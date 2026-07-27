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
    delete nextEnv.LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS;
    process.env = nextEnv;

    const { env } = await loadEnvModule();

    expect(env.PRICE_CHECK_INTERVAL_HOURS).toBe(12);
    expect(env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT).toBe(5);
    expect(env.LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS).toBe(5);
  });

  it('reads configured listed price attention settings', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT: '7.5',
      LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS: '9',
    };

    const { env } = await loadEnvModule();

    expect(env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT).toBe(7.5);
    expect(env.LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS).toBe(9);
  });

  it('defaults scanner OCR settings', async () => {
    const nextEnv = { ...ORIGINAL_ENV };
    delete nextEnv.TESSERACT_BIN;
    delete nextEnv.IMAGEMAGICK_BIN;
    delete nextEnv.SCANNER_OCR_DEBUG;
    process.env = nextEnv;

    const { env } = await loadEnvModule();

    expect(env.TESSERACT_BIN).toBe('tesseract');
    expect(env.IMAGEMAGICK_BIN).toBe('magick');
    expect(env.SCANNER_OCR_DEBUG).toBe(false);
  });

  it('defaults local HTTPS settings to disabled with no certificate paths', async () => {
    const nextEnv = { ...ORIGINAL_ENV };
    delete nextEnv.HTTPS_ENABLED;
    delete nextEnv.HTTPS_CERT_FILE;
    delete nextEnv.HTTPS_KEY_FILE;
    process.env = nextEnv;

    const { env } = await loadEnvModule();

    expect(env.HTTPS_ENABLED).toBe(false);
    expect(env.HTTPS_CERT_FILE).toBe('');
    expect(env.HTTPS_KEY_FILE).toBe('');
  });

  it('reads configured local HTTPS settings', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      HTTPS_ENABLED: 'true',
      HTTPS_CERT_FILE: '/app/certs/local-cert.pem',
      HTTPS_KEY_FILE: '/app/certs/local-key.pem',
    };

    const { env } = await loadEnvModule();

    expect(env.HTTPS_ENABLED).toBe(true);
    expect(env.HTTPS_CERT_FILE).toBe('/app/certs/local-cert.pem');
    expect(env.HTTPS_KEY_FILE).toBe('/app/certs/local-key.pem');
  });
});
