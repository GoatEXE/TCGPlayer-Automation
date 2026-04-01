import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queueAdd = vi.fn();
const queueGetRepeatableJobs = vi.fn();
const queueRemoveRepeatableByKey = vi.fn();
const queueWaitUntilReady = vi.fn();
const queueClose = vi.fn();

const workerWaitUntilReady = vi.fn();
const workerClose = vi.fn();
const workerOn = vi.fn();

const runPriceCheck = vi.fn();
const sendTelegramMessage = vi.fn();
const sendNeedsAttentionAlert = vi.fn();

const dbUpdate = vi.fn();
const dbSet = vi.fn();
const dbWhere = vi.fn();

let workerProcessor: ((job: { name: string }) => Promise<void>) | null = null;

vi.mock('bullmq', () => ({
  Queue: vi.fn(function MockQueue() {
    return {
      add: queueAdd,
      getRepeatableJobs: queueGetRepeatableJobs,
      removeRepeatableByKey: queueRemoveRepeatableByKey,
      waitUntilReady: queueWaitUntilReady,
      close: queueClose,
    };
  }),
  Worker: vi.fn(function MockWorker(_queueName: string, processor: any) {
    workerProcessor = processor;

    return {
      waitUntilReady: workerWaitUntilReady,
      close: workerClose,
      on: workerOn,
    };
  }),
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'development',
    PRICE_CHECK_INTERVAL_HOURS: 12,
    PRICE_DRIFT_THRESHOLD_PERCENT: 2,
    REDIS_URL: 'redis://localhost:6379',
  },
}));

vi.mock('../run-price-check.js', () => ({
  runPriceCheck,
}));

vi.mock('../../notifications/telegram.js', () => ({
  sendTelegramMessage,
  sendNeedsAttentionAlert,
}));

vi.mock('../../../db/index.js', () => ({
  db: {
    update: dbUpdate,
  },
}));

async function loadSchedulerModule() {
  return import('../scheduler.js');
}

describe('buildScheduledPriceCheckMessage', () => {
  it('includes summary, top drifted cards, and first error', async () => {
    const { buildScheduledPriceCheckMessage } = await loadSchedulerModule();

    const message = buildScheduledPriceCheckMessage(
      {
        updated: 42,
        notFound: 3,
        drifted: 4,
        errors: ['Error fetching pricing for set Origins: timeout'],
        driftedCards: [
          {
            cardId: 1,
            productName: 'Jinx',
            previousListingPrice: 1.96,
            newListingPrice: 2.24,
            driftPercent: 14.29,
          },
          {
            cardId: 2,
            productName: 'Yasuo',
            previousListingPrice: 0.49,
            newListingPrice: 0.42,
            driftPercent: -14.29,
          },
        ],
      },
      2,
    );

    expect(message).toContain('📈 Scheduled price check completed');
    expect(message).toContain('Updated: 42');
    expect(message).toContain('Not found: 3');
    expect(message).toContain('Drifted (>= 2%): 4');
    expect(message).toContain('Errors: 1');
    expect(message).toContain('Top drifted cards:');
    expect(message).toContain('• Jinx - $1.96 → $2.24 (+14.29%)');
    expect(message).toContain('• Yasuo - $0.49 → $0.42 (-14.29%)');
    expect(message).toContain('First error:');
  });

  it('omits drift and error detail sections when none', async () => {
    const { buildScheduledPriceCheckMessage } = await loadSchedulerModule();

    const message = buildScheduledPriceCheckMessage(
      {
        updated: 10,
        notFound: 0,
        drifted: 0,
        errors: [],
        driftedCards: [],
      },
      2,
    );

    expect(message).toContain('Updated: 10');
    expect(message).not.toContain('Top drifted cards:');
    expect(message).not.toContain('First error:');
  });

  it('limits drift details to top 5 by absolute drift', async () => {
    const { buildScheduledPriceCheckMessage } = await loadSchedulerModule();

    const driftedCards = Array.from({ length: 7 }, (_, i) => ({
      cardId: i + 1,
      productName: `Card ${i + 1}`,
      previousListingPrice: 1,
      newListingPrice: 1 + i / 10,
      driftPercent: i + 1,
    }));

    const message = buildScheduledPriceCheckMessage(
      {
        updated: 7,
        notFound: 0,
        drifted: 7,
        errors: [],
        driftedCards,
      },
      2,
    );

    const lines = message
      .split('\n')
      .filter((line) => line.trim().startsWith('• '));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('Card 7');
  });
});

describe('BullMQ price check scheduler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    workerProcessor = null;

    queueGetRepeatableJobs.mockResolvedValue([]);
    queueWaitUntilReady.mockResolvedValue(undefined);
    queueClose.mockResolvedValue(undefined);
    workerWaitUntilReady.mockResolvedValue(undefined);
    workerClose.mockResolvedValue(undefined);
    workerOn.mockReturnValue(undefined);

    dbUpdate.mockReturnValue({ set: dbSet });
    dbSet.mockReturnValue({ where: dbWhere });
    dbWhere.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { stopPriceCheckScheduler } = await loadSchedulerModule();
    await stopPriceCheckScheduler();
  });

  it('registers the repeatable BullMQ job and exposes enabled status', async () => {
    const { getPriceCheckSchedulerStatus, startPriceCheckScheduler } =
      await loadSchedulerModule();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await startPriceCheckScheduler(logger);

    expect(queueGetRepeatableJobs).toHaveBeenCalledOnce();
    expect(queueRemoveRepeatableByKey).not.toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledWith(
      'check-prices',
      {},
      expect.objectContaining({
        jobId: 'check-prices-repeat',
        repeat: { every: 12 * 60 * 60 * 1000 },
      }),
    );

    expect(getPriceCheckSchedulerStatus()).toMatchObject({
      enabled: true,
      intervalHours: 12,
      thresholdPercent: 2,
      running: false,
      lastRun: null,
    });
  });

  it('removes existing repeat jobs for the scheduler before adding the current one', async () => {
    queueGetRepeatableJobs.mockResolvedValueOnce([
      {
        key: 'repeat:legacy-check-prices',
        name: 'check-prices',
        id: 'legacy-job-id',
      },
      {
        key: 'repeat:current-check-prices',
        name: 'other-job',
        id: 'check-prices-repeat',
      },
      {
        key: 'repeat:leave-alone',
        name: 'other-job',
        id: 'other-job-id',
      },
    ]);

    const { startPriceCheckScheduler } = await loadSchedulerModule();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await startPriceCheckScheduler(logger);

    expect(queueRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(queueRemoveRepeatableByKey).toHaveBeenNthCalledWith(
      1,
      'repeat:legacy-check-prices',
    );
    expect(queueRemoveRepeatableByKey).toHaveBeenNthCalledWith(
      2,
      'repeat:current-check-prices',
    );
    expect(queueAdd).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('clearedExistingRepeatJobs=2'),
    );
  });

  it('executes scheduled jobs through the worker and records last run state', async () => {
    const { getPriceCheckSchedulerStatus, startPriceCheckScheduler } =
      await loadSchedulerModule();

    runPriceCheck.mockResolvedValue({
      updated: 3,
      notFound: 1,
      drifted: 1,
      errors: ['Error fetching pricing for set Origins: timeout'],
      driftedCards: [
        {
          cardId: 1,
          productName: 'Jinx',
          previousListingPrice: 1.96,
          newListingPrice: 2.24,
          driftPercent: 14.29,
        },
      ],
      driftedHistoryIds: [101],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
    });
    sendTelegramMessage.mockResolvedValueOnce(true);

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await startPriceCheckScheduler(logger);
    await workerProcessor?.({ name: 'check-prices' });

    expect(runPriceCheck).toHaveBeenCalledWith({ source: 'scheduled' });
    expect(sendTelegramMessage).toHaveBeenCalledOnce();
    expect(dbUpdate).toHaveBeenCalled();
    expect(dbSet).toHaveBeenCalledWith({ notificationSent: true });

    expect(getPriceCheckSchedulerStatus()).toMatchObject({
      enabled: true,
      running: false,
      lastRun: expect.objectContaining({
        success: true,
        updated: 3,
        notFound: 1,
        drifted: 1,
        errors: ['Error fetching pricing for set Origins: timeout'],
      }),
    });
  });

  it('does not mark notifications as sent when telegram send fails', async () => {
    const { startPriceCheckScheduler } = await loadSchedulerModule();

    runPriceCheck.mockResolvedValue({
      updated: 1,
      notFound: 0,
      drifted: 1,
      errors: [],
      driftedCards: [
        {
          cardId: 1,
          productName: 'Jinx',
          previousListingPrice: 1,
          newListingPrice: 1.2,
          driftPercent: 20,
        },
      ],
      driftedHistoryIds: [201],
      needsAttentionCards: [],
      needsAttentionHistoryIds: [],
    });
    sendTelegramMessage.mockRejectedValueOnce(new Error('telegram down'));

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await startPriceCheckScheduler(logger);
    await workerProcessor?.({ name: 'check-prices' });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('telegram notification failed'),
    );
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it('sends needs_attention alerts and marks successful notifications', async () => {
    const { startPriceCheckScheduler } = await loadSchedulerModule();

    runPriceCheck.mockResolvedValue({
      updated: 0,
      notFound: 1,
      drifted: 0,
      errors: [],
      driftedCards: [],
      driftedHistoryIds: [],
      needsAttentionCards: [
        { cardId: 10, productName: 'No Market Card' },
        { cardId: 11, productName: 'Also Missing' },
      ],
      needsAttentionHistoryIds: [301, 302],
    });

    sendNeedsAttentionAlert
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('telegram down'));

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await startPriceCheckScheduler(logger);
    await workerProcessor?.({ name: 'check-prices' });

    expect(sendNeedsAttentionAlert).toHaveBeenCalledTimes(2);
    expect(dbSet).toHaveBeenCalledWith({ notificationSent: true });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('needs_attention telegram notification failed'),
    );
  });

  it('stays disabled when BullMQ cannot connect to Redis', async () => {
    queueAdd.mockRejectedValueOnce(new Error('redis unavailable'));

    const { getPriceCheckSchedulerStatus, startPriceCheckScheduler } =
      await loadSchedulerModule();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await startPriceCheckScheduler(logger);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to initialize BullMQ scheduler'),
    );
    expect(getPriceCheckSchedulerStatus().enabled).toBe(false);
  });
});
