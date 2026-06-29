import { env } from '../../config/env.js';

let runtimePriceCheckIntervalHours = env.PRICE_CHECK_INTERVAL_HOURS;
let runtimeListedPriceAttentionThresholdPercent =
  env.LISTED_PRICE_ATTENTION_THRESHOLD_PERCENT;
let runtimeListedPriceAttentionMinDiffCents =
  env.LISTED_PRICE_ATTENTION_MIN_DIFF_CENTS;

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

export function getRuntimeListedPriceAttentionMinDiffCents(): number {
  return runtimeListedPriceAttentionMinDiffCents;
}

export function setRuntimeListedPriceAttentionMinDiffCents(
  minDiffCents: number,
): void {
  runtimeListedPriceAttentionMinDiffCents = minDiffCents;
}
