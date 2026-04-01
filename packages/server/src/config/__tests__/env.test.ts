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
});
