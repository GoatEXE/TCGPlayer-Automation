# Phase 2.1 — BullMQ + Redis Scheduler Migration

Date: 2026-03-31

## Summary
Implemented Redis-backed BullMQ scheduling for Phase 2.1 and replaced the prior in-process timer path. Manual price checks remain unchanged, while scheduled price checks now run through a repeatable BullMQ job on the `price-check` queue.

## Files Changed
- `docker-compose.yml`
- `.env.example`
- `packages/server/package.json`
- `packages/server/src/config/env.ts`
- `packages/server/src/index.ts`
- `packages/server/src/lib/price-check/scheduler.ts`
- `packages/server/src/lib/price-check/__tests__/scheduler.test.ts`
- `pnpm-lock.yaml`

## Architecture Notes
### Queueing model
- Queue name: `price-check`
- Repeatable job name: `check-prices`
- Repeat job id: `check-prices-repeat`
- Schedule interval: `PRICE_CHECK_INTERVAL_HOURS`, converted to milliseconds for BullMQ `repeat.every`
- On startup, the scheduler first loads existing repeat jobs and removes any job with:
  - name `check-prices`, or
  - id `check-prices-repeat`

  This prevents duplicate repeat registrations after interval/config changes or prior scheduler iterations.

### Runtime flow
- App startup still runs DB migrations first.
- After migrations, the server initializes the BullMQ queue + worker.
- The worker listens on the `price-check` queue and only executes the `check-prices` job.
- When the job runs, it calls:
  - `runPriceCheck({ source: 'scheduled' })`
- Manual route behavior is unchanged:
  - `POST /api/cards/fetch-prices` still calls `runPriceCheck({ source: 'manual' })`

### Status endpoint
`GET /api/cards/price-check-status` remains active and now reports BullMQ-driven scheduler state:
- `enabled`
- `intervalHours`
- `thresholdPercent`
- `running`
- `lastRun`

`lastRun` is updated by the BullMQ worker execution path, so the endpoint reflects scheduled-job state rather than the removed in-process timer.

### No double scheduling
The previous in-process `setInterval()` scheduler path was removed. Scheduling now happens only through BullMQ startup initialization in `packages/server/src/lib/price-check/scheduler.ts`.

## Redis / Compose Changes
Added profile-specific Redis services:

### Dev
- service: `redis-dev`
- profile: `dev`
- port exposed: `6379:6379`
- app uses: `REDIS_URL=redis://redis-dev:6379`

### Prod
- service: `redis`
- profile: `prod`
- app uses: `REDIS_URL=redis://redis:6379`

Also added persistent Redis volume:
- `redisdata`

## Environment Changes
Added server env support:
- `REDIS_URL`
  - schema default: `redis://localhost:6379`

Updated `.env.example` to document local vs Docker Redis hostnames.

## Failure Behavior When Redis Is Unavailable
Current behavior is fail-open:
- the Fastify app still starts
- scheduler initialization logs an error
- BullMQ queue/worker are cleaned up if partial init occurred
- `/api/cards/price-check-status` reports `enabled: false`
- manual `POST /api/cards/fetch-prices` continues to work because it does not depend on BullMQ

This avoids taking down the API when Redis is temporarily unavailable, but scheduled price checks will not run until Redis becomes available and the app is restarted/reinitialized.

## Tests Added / Adjusted
Updated scheduler tests to mock BullMQ queue + worker initialization and execution.

### Server tests
Command:
- `pnpm --filter server test`

Result:
- 8 test files passed
- 88 tests passed
- 0 failed

### Web tests
Command:
- `pnpm --filter web test`

Result:
- 5 test files passed
- 46 tests passed
- 0 failed

### Format check
Command:
- `pnpm format:check`

Result:
- passed

## Additional Verification
### Docker bring-up
Command:
- `docker compose up --build -d`

Result:
- passed in dev profile
- `db-dev`, `redis-dev`, and `app-dev` started successfully

### Docker process status
Command:
- `docker compose ps`

Observed:
- `tcgplayer-automation-app-dev-1` — Up
- `tcgplayer-automation-db-dev-1` — Up (healthy)
- `tcgplayer-automation-redis-dev-1` — Up (healthy)

### Status endpoint check
Command:
- `curl -s http://localhost:3000/api/cards/price-check-status`

Observed response:
```json
{"enabled":true,"intervalHours":12,"thresholdPercent":2,"running":false,"lastRun":null}
```

This confirms the BullMQ-backed scheduler initialized successfully against Redis in Docker.

## Quick Manual Verification Steps
1. Start stack:
   - `docker compose up --build -d`
2. Confirm Redis is present:
   - `docker compose ps`
3. Check scheduler status:
   - `curl -s http://localhost:3000/api/cards/price-check-status`
4. Confirm manual route still works:
   - `POST /api/cards/fetch-prices`
5. Wait one interval or reduce `PRICE_CHECK_INTERVAL_HOURS` for a shorter test and re-check status endpoint for `lastRun` changes.

## Typecheck Note
Attempted TypeScript verification:
- `pnpm --filter web exec tsc --noEmit -p tsconfig.json` ✅ passed
- `pnpm --filter server exec tsc --noEmit -p tsconfig.json` ❌ failed due pre-existing route/test typing issues unrelated to the BullMQ/Redis migration

Primary existing failures are in:
- `packages/server/src/routes/cards.ts`
- `packages/server/src/routes/__tests__/cards.test.ts`

These errors are mostly existing response-type mismatches and test fixture typing drift, not BullMQ scheduler errors.
