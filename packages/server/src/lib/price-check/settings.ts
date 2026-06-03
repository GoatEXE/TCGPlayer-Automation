import { env } from '../../config/env.js';

let runtimePriceCheckIntervalHours = env.PRICE_CHECK_INTERVAL_HOURS;
let runtimeListedPriceAttentionThresholdPercent =
  env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT;

export function getRuntimePriceCheckIntervalHours(): number {
  return runtimePriceCheckIntervalHours;
}

export function setRuntimePriceCheckIntervalHours(intervalHours: number): void {
  runtimePriceCheckIntervalHours = intervalHours;
}

export function getRuntimeListedPriceAttentionThresholdPercent(): number {
  return runtimeListedPriceAttentionThresholdPercent;
}

export function setRuntimeListedPriceAttentionThresholdPercent(
  thresholdPercent: number,
): void {
  runtimeListedPriceAttentionThresholdPercent = thresholdPercent;
}
