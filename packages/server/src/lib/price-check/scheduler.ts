import { inArray } from 'drizzle-orm';
import { Queue, Worker, type RedisOptions } from 'bullmq';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { priceHistory } from '../../db/schema/price-history.js';
import {
  sendNeedsAttentionAlert,
  sendTelegramMessage,
} from '../notifications/telegram.js';
import type { RunPriceCheckResult } from './run-price-check.js';
import { runPriceCheck } from './run-price-check.js';

interface LoggerLike {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface PriceCheckLastRun {
  startedAt: string;
  finishedAt: string;
  success: boolean;
  updated: number;
  notFound: number;
  drifted: number;
  errors: string[];
}

const PRICE_CHECK_QUEUE = 'price-check';
const PRICE_CHECK_JOB = 'check-prices';
const PRICE_CHECK_REPEAT_JOB_ID = 'check-prices-repeat';

let queue: Queue | null = null;
let worker: Worker | null = null;
let running = false;
let lastRun: PriceCheckLastRun | null = null;
let runtimeIntervalHours = env.PRICE_CHECK_INTERVAL_HOURS;

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDriftPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function getRedisConnectionOptions(): RedisOptions {
  const url = new URL(env.REDIS_URL);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db:
      url.pathname && url.pathname !== '/'
        ? Number(url.pathname.slice(1))
        : undefined,
    maxRetriesPerRequest: null,
  };
}

export function buildScheduledPriceCheckMessage(
  result: Pick<
    RunPriceCheckResult,
    'updated' | 'notFound' | 'drifted' | 'errors' | 'driftedCards'
  >,
  thresholdPercent: number,
): string {
  const lines = [
    '📈 Scheduled price check completed',
    `Updated: ${result.updated}`,
    `Not found: ${result.notFound}`,
    `Drifted (>= ${thresholdPercent}%): ${result.drifted}`,
    `Errors: ${result.errors.length}`,
  ];

  if (result.driftedCards.length > 0) {
    lines.push('', 'Top drifted cards:');

    const topDrifted = [...result.driftedCards]
      .sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent))
      .slice(0, 5);

    for (const card of topDrifted) {
      lines.push(
        `• ${card.productName} - ${formatPrice(card.previousListingPrice)} → ${formatPrice(card.newListingPrice)} (${formatDriftPercent(card.driftPercent)})`,
      );
    }
  }

  if (result.errors.length > 0) {
    lines.push('', 'First error:', result.errors[0]);
  }

  return lines.join('\n');
}

async function markHistoryNotificationsSent(
  historyIds: number[],
  logger: LoggerLike,
) {
  const uniqueIds = [...new Set(historyIds)].filter((id) => id > 0);
  if (uniqueIds.length === 0) {
    return;
  }

  await db
    .update(priceHistory)
    .set({ notificationSent: true })
    .where(inArray(priceHistory.id, uniqueIds));

  logger.info(
    `[price-check] marked notification_sent=true for ${uniqueIds.length} price_history rows`,
  );
}

async function executeScheduledRun(logger: LoggerLike) {
  if (running) {
    logger.warn(
      '[price-check] Skipping run because previous run is still active',
    );
    return;
  }

  running = true;
  const startedAt = new Date();

  try {
    const result = await runPriceCheck({ source: 'scheduled' });

    lastRun = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      success: true,
      updated: result.updated,
      notFound: result.notFound,
      drifted: result.drifted,
      errors: result.errors,
    };

    logger.info(
      `[price-check] completed: updated=${result.updated}, notFound=${result.notFound}, drifted=${result.drifted}, errors=${result.errors.length}`,
    );

    if (result.drifted > 0 || result.errors.length > 0) {
      const message = buildScheduledPriceCheckMessage(
        result,
        env.PRICE_DRIFT_THRESHOLD_PERCENT,
      );

      try {
        const sent = await sendTelegramMessage(message, {
          eventType: 'price_check_summary',
        });
        if (sent) {
          await markHistoryNotificationsSent(result.driftedHistoryIds, logger);
        }
      } catch (error) {
        logger.error(`[price-check] telegram notification failed: ${error}`);
      }
    }

    if (result.needsAttentionCards.length > 0) {
      const sentNeedsAttentionHistoryIds: number[] = [];

      for (const [index, card] of result.needsAttentionCards.entries()) {
        try {
          const sent = await sendNeedsAttentionAlert(card);
          if (sent && result.needsAttentionHistoryIds[index]) {
            sentNeedsAttentionHistoryIds.push(
              result.needsAttentionHistoryIds[index],
            );
          }
        } catch (error) {
          logger.error(
            `[price-check] needs_attention telegram notification failed for cardId=${card.cardId}: ${error}`,
          );
        }
      }

      await markHistoryNotificationsSent(sentNeedsAttentionHistoryIds, logger);
    }
  } catch (error) {
    lastRun = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      success: false,
      updated: 0,
      notFound: 0,
      drifted: 0,
      errors: [String(error)],
    };
    logger.error(`[price-check] run failed: ${error}`);

    try {
      await sendTelegramMessage(
        `❌ Scheduled price check failed\n${String(error)}`,
        {
          eventType: 'price_check_failed',
        },
      );
    } catch {
      // Ignore secondary notification errors
    }
  } finally {
    running = false;
  }
}

export async function updatePriceCheckIntervalHours(
  intervalHours: number,
  logger: LoggerLike,
): Promise<void> {
  runtimeIntervalHours = intervalHours;

  if (!queue || !worker || env.NODE_ENV === 'test') {
    logger.info(`[price-check] updated intervalHours=${runtimeIntervalHours}`);
    return;
  }

  const existingRepeatJobs = await queue.getRepeatableJobs();
  const repeatJobsToRemove = existingRepeatJobs.filter(
    (job) =>
      job.name === PRICE_CHECK_JOB || job.id === PRICE_CHECK_REPEAT_JOB_ID,
  );

  for (const job of repeatJobsToRemove) {
    await queue.removeRepeatableByKey(job.key);
  }

  const intervalMs = Math.max(1000, runtimeIntervalHours * 60 * 60 * 1000);

  await queue.add(
    PRICE_CHECK_JOB,
    {},
    {
      jobId: PRICE_CHECK_REPEAT_JOB_ID,
      repeat: { every: intervalMs },
    },
  );

  logger.info(
    `[price-check] updated intervalHours=${runtimeIntervalHours}, re-registeredRepeatJobs=${repeatJobsToRemove.length}`,
  );
}

export async function startPriceCheckScheduler(logger: LoggerLike) {
  if (env.NODE_ENV === 'test') {
    return;
  }

  if (queue || worker) {
    return;
  }

  try {
    const connection = getRedisConnectionOptions();

    queue = new Queue(PRICE_CHECK_QUEUE, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });

    worker = new Worker(
      PRICE_CHECK_QUEUE,
      async (job) => {
        if (job.name !== PRICE_CHECK_JOB) {
          return;
        }

        await executeScheduledRun(logger);
      },
      {
        connection,
        concurrency: 1,
      },
    );

    worker.on('error', (error) => {
      logger.error(`[price-check] worker error: ${error}`);
    });

    const intervalMs = Math.max(1000, runtimeIntervalHours * 60 * 60 * 1000);

    const existingRepeatJobs = await queue.getRepeatableJobs();
    const repeatJobsToRemove = existingRepeatJobs.filter(
      (job) =>
        job.name === PRICE_CHECK_JOB || job.id === PRICE_CHECK_REPEAT_JOB_ID,
    );

    for (const job of repeatJobsToRemove) {
      await queue.removeRepeatableByKey(job.key);
    }

    await queue.add(
      PRICE_CHECK_JOB,
      {},
      {
        jobId: PRICE_CHECK_REPEAT_JOB_ID,
        repeat: {
          every: intervalMs,
        },
      },
    );

    logger.info(
      `[price-check] bullmq scheduler enabled, interval=${runtimeIntervalHours}h, clearedExistingRepeatJobs=${repeatJobsToRemove.length}`,
    );
  } catch (error) {
    logger.error(
      `[price-check] failed to initialize BullMQ scheduler: ${error}`,
    );

    // Fail-open: app remains available even if scheduler infra is down.
    if (worker) {
      await worker.close().catch(() => undefined);
      worker = null;
    }

    if (queue) {
      await queue.close().catch(() => undefined);
      queue = null;
    }
  }
}

export async function stopPriceCheckScheduler() {
  if (worker) {
    await worker.close().catch(() => undefined);
    worker = null;
  }

  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
}

export function getPriceCheckSchedulerStatus() {
  return {
    enabled: queue !== null && worker !== null && env.NODE_ENV !== 'test',
    intervalHours: runtimeIntervalHours,
    thresholdPercent: env.PRICE_DRIFT_THRESHOLD_PERCENT,
    running,
    lastRun,
  };
}
