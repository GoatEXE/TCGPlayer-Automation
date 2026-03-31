import { env } from '../../config/env.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
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

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDriftPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
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

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastRun: PriceCheckLastRun | null = null;

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
        await sendTelegramMessage(message);
      } catch (error) {
        logger.error(`[price-check] telegram notification failed: ${error}`);
      }
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
      );
    } catch {
      // Ignore secondary notification errors
    }
  } finally {
    running = false;
  }
}

export function startPriceCheckScheduler(logger: LoggerLike) {
  if (env.NODE_ENV === 'test') {
    return;
  }

  if (timer) {
    return;
  }

  const intervalMs = env.PRICE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
  logger.info(
    `[price-check] scheduler enabled, interval=${env.PRICE_CHECK_INTERVAL_HOURS}h`,
  );

  timer = setInterval(() => {
    void executeScheduledRun(logger);
  }, intervalMs);

  timer.unref?.();
}

export function stopPriceCheckScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getPriceCheckSchedulerStatus() {
  return {
    enabled: timer !== null && env.NODE_ENV !== 'test',
    intervalHours: env.PRICE_CHECK_INTERVAL_HOURS,
    thresholdPercent: env.PRICE_DRIFT_THRESHOLD_PERCENT,
    running,
    lastRun,
  };
}
