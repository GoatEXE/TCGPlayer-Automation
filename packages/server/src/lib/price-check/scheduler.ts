import { env } from '../../config/env.js';
import { sendTelegramMessage } from '../notifications/telegram.js';
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
      const lines = [
        '📈 Scheduled price check completed',
        `Updated: ${result.updated}`,
        `Not found: ${result.notFound}`,
        `Drifted (>= ${env.PRICE_DRIFT_THRESHOLD_PERCENT}%): ${result.drifted}`,
        `Errors: ${result.errors.length}`,
      ];

      if (result.errors.length > 0) {
        lines.push('', 'First error:', result.errors[0]);
      }

      try {
        await sendTelegramMessage(lines.join('\n'));
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
