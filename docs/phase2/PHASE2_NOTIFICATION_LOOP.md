# Phase 2.5 — Notification Closing Loop (`notificationSent`)

Date: 2026-04-01

## Summary
Closed the notification-tracking gap between scheduled price checks and Telegram delivery.

Before this slice, `price_history.notificationSent` was always written as `false` and never updated after sends. Now scheduler notification flows set it to `true` **only when Telegram delivery succeeds**.

## What Was Implemented

### 1) `runPriceCheck` now returns notification-tracking metadata
File: `packages/server/src/lib/price-check/run-price-check.ts`

Added to `RunPriceCheckResult`:
- `driftedHistoryIds: number[]`
- `needsAttentionCards: { cardId: number; productName: string }[]`
- `needsAttentionHistoryIds: number[]`

Implementation detail:
- `price_history` inserts now use `.returning({ id: priceHistory.id })`.
- Those IDs are captured and categorized for scheduler follow-up updates.

### 2) Scheduler updates `notificationSent` after successful sends
File: `packages/server/src/lib/price-check/scheduler.ts`

Added logic:
- After successful aggregate drift summary send, mark matching `driftedHistoryIds` as `notificationSent = true`.
- Send per-card `needs_attention` alerts.
- Mark only successfully sent `needsAttentionHistoryIds` as `notificationSent = true`.
- If send fails, rows remain `false` (for future retry/audit).

### 3) Added per-card needs-attention alert helper
File: `packages/server/src/lib/notifications/telegram.ts`

New helper:
- `sendNeedsAttentionAlert({ cardId, productName })`
- Reuses existing env-gated Telegram send behavior.

## Test Coverage

Updated tests:
- `packages/server/src/lib/price-check/__tests__/run-price-check.test.ts`
  - verifies new result arrays/IDs
  - verifies `needs_attention` cards are only surfaced for transitions
- `packages/server/src/lib/price-check/__tests__/scheduler.test.ts`
  - verifies sent-flag updates on success
  - verifies flags are not marked when Telegram send fails
  - verifies per-card needs-attention alert path
- `packages/server/src/lib/notifications/__tests__/telegram.test.ts`
  - verifies helper formatting and env gating
- `packages/server/src/routes/__tests__/cards.test.ts`
  - updated mock chain for `price_history` insert `.returning()` in fetch-prices tests

## Validation
- `pnpm --filter server test` ✅ 116 passing
- `pnpm --filter server exec tsc --noEmit -p tsconfig.json` ✅ passing
- `pnpm format:check` ✅ passing

## Migration Impact
- **No migration required**.
- Uses existing `price_history.notification_sent` column.
