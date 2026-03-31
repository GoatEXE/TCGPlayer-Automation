import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://tcgplayer:tcgplayer@localhost:5432/tcgplayer'),
  TCGTRACKING_BASE_URL: z
    .string()
    .url()
    .default('https://tcgtracking.com/tcgapi/v1'),
  RIFTBOUND_CATEGORY_ID: z.coerce.number().default(89),
  MIN_LISTING_PRICE_CENTS: z.coerce.number().default(5),
  LISTING_PRICE_MULTIPLIER: z.coerce.number().default(0.98),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  PRICE_CHECK_INTERVAL_HOURS: z.coerce.number().default(12),
  PRICE_DRIFT_THRESHOLD_PERCENT: z.coerce.number().default(2),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
