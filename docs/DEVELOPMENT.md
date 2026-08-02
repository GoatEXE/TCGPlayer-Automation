# Development Guide

This project is a pnpm monorepo with a Fastify API, Vite/React dashboard, PostgreSQL, and Redis. Docker Compose is the preferred way to run the full stack.

## Docker Compose profiles

The repo uses a single `docker-compose.yml` controlled by `COMPOSE_PROFILES` in `.env`.

### Development

```bash
cp .env.example .env
# .env defaults to COMPOSE_PROFILES=dev
docker compose up
```

Development mode starts:

- `app-dev` with `pnpm dev`
- `db-dev` on `localhost:5432`
- `redis-dev` on `localhost:6379`
- Vite dev server on `localhost:5173` (`VITE_HOST_PORT`)
- API server on `localhost:3000` (`DEV_APP_HOST_PORT`)

### Production

```bash
cp .env.example .env
# edit .env and set COMPOSE_PROFILES=prod
docker compose up -d
```

Production mode starts the built `app` service on `localhost:3000` (`APP_HOST_PORT`). The frontend is served by the server at `/`, API routes are under `/api/*`, and PostgreSQL/Redis are internal Docker services.

### App host ports

The server listens on container port `3000` in both Docker profiles. The host-side ports are configurable so dev and prod can avoid collisions:

```dotenv
APP_HOST_PORT=3000      # prod app host port
DEV_APP_HOST_PORT=3000  # dev API host port
VITE_HOST_PORT=5173     # dev dashboard host port
```

If the dev profile is already running and you want to start prod for Android scanner testing, either stop dev first:

```bash
docker compose down
```

or set a different production host port in `.env` before starting prod:

```dotenv
COMPOSE_PROFILES=prod
APP_HOST_PORT=3001
```

Then use `http://<host-or-ip>:3001` for prod HTTP instead of port `3000`.

### Android scanner catalog readiness

The scanner backend no longer performs server-side image OCR. Android/native clients perform OCR on-device and use the backend only for cached catalog resolution.

To verify catalog readiness from the phone/LAN URL:

```bash
curl "http://<host-or-ip>:3000/api/scanner/status"
```

The status response includes `catalog` readiness plus a compatibility `ocr` object with `engine: "native-client"` and `required: false`.

Native companion scanners can ask the cached catalog resolver to resolve on-device OCR text:

```bash
curl -X POST "http://<host-or-ip>:3000/api/scanner/resolve-text" \
  -H "Content-Type: application/json" \
  -d '{"rawText":"UNL • 209/219","region":"bottom-right","confidence":0.91}'
```

Optional `setCodeHint` can narrow exact-name fallback when ML Kit reads a clear card name but misses the printed ID. Special printed IDs such as rune IDs (`UNL - R02`) resolve by exact cached catalog number; token face IDs such as `UNL - T07` are supported but may return `status: "ambiguous"` with selectable `alternatives` when the cached catalog has multiple products for the same printed token face. The response uses the scanner candidate shape (`candidates`, `errors`) plus `debug.regions[0].rawText` and `debug.regions[0].parsedAttempts`; it is read-only and does not mutate inventory or collections.

`catalog.ready` is `false` until catalog cards are cached in the database. Scanner recognition intentionally resolves against the cached catalog only, so populate it explicitly before live scanning instead of syncing during each frame:

```bash
# Refresh known Riftbound sets and inspect their set codes.
curl "http://<host-or-ip>:3000/api/catalog/sets?sync=true"

# Cache cards for every currently exposed Riftbound set (recommended before scanning).
curl -X POST "http://<host-or-ip>:3000/api/catalog/sync" \
  -H "Content-Type: application/json" \
  -d '{}'

# Or refresh only one set (example: UNL).
curl -X POST "http://<host-or-ip>:3000/api/catalog/sync" \
  -H "Content-Type: application/json" \
  -d '{"setCode":"UNL"}'
```

`POST /api/catalog/sync` without `setCode` refreshes the Riftbound set list first, then syncs cards for every cached set. The response includes `status`, `syncedSets`, `attemptedSets`, total `syncedCards`, and per-set `results`; if one set fails, successful sets remain synced and the response returns `status: "partial"` with per-set errors. If refreshing the set list fails, the response can include `setListError` while still syncing previously cached sets.

For Android testing, open the native scanner, sync the catalog if status is not ready, scan cards with on-device OCR, review rows, then add/transfer through the collection APIs. The web app no longer exposes a browser camera/image-OCR scanning workflow.

### Switching profiles

```bash
# edit .env and change COMPOSE_PROFILES
docker compose down
docker compose up -d
```

## Local development without the app container

```bash
pnpm install

docker compose up db-dev redis-dev -d

# Use localhost service names when running outside Docker:
# DATABASE_URL=postgresql://tcgplayer:tcgplayer@localhost:5432/tcgplayer
# REDIS_URL=redis://localhost:6379

pnpm dev
```

## Common commands

```bash
pnpm dev              # Start API + frontend concurrently
pnpm build            # Build server + web for production
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm lint             # Run ESLint
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting
```

Database helpers:

```bash
pnpm --filter server db:migrate    # Run Drizzle migrations manually
pnpm --filter server db:seed       # Seed development data
pnpm --filter server db:studio     # Open Drizzle Studio
```

Docker helpers:

```bash
docker compose up                 # Start with logs in foreground
docker compose up -d              # Start in background
docker compose down               # Stop and remove containers
docker compose down -v            # Stop and remove volumes, including database data
docker compose logs -f app        # Follow production app logs
docker compose logs -f app-dev    # Follow development app logs
docker compose build              # Rebuild images
```

## Migrations

The server runs Drizzle migrations during startup before registering API routes. This applies in both Docker profiles. If migrations fail, startup fails fast and the error appears in container logs.

Manual migration commands are still available through the server package scripts when needed.

## Configuration

Use `.env.example` as the source of truth for environment variables. Important groups include:

- Docker profile and host ports: `COMPOSE_PROFILES`, `APP_HOST_PORT`, `DEV_APP_HOST_PORT`, `VITE_HOST_PORT`
- Database: `POSTGRES_*`, `DATABASE_URL`
- Redis: `REDIS_URL`
- Pricing: `MIN_LISTING_PRICE_CENTS`, `LISTING_PRICE_MULTIPLIER`, `MAX_PRICE_DROP_PERCENT`
- Scheduler: `PRICE_CHECK_INTERVAL_HOURS`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, notification toggles
- Seller info for invoice and packing slip templates

## Testing notes

Tests use Vitest and live alongside source files. The project preference is test-first implementation: write tests, implement behavior, then validate with the relevant package test command or `pnpm test`.
