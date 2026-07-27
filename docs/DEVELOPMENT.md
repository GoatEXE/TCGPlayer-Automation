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

If the dev profile is already running and you want to start prod for mobile HTTPS testing, either stop dev first:

```bash
docker compose down
```

or set a different production host port in `.env` before starting prod:

```dotenv
COMPOSE_PROFILES=prod
APP_HOST_PORT=3001
```

Then use `https://<host-or-ip>:3001` for prod HTTPS instead of port `3000`.

### Optional local HTTPS

The Docker image generates a self-signed certificate at build time for local/LAN HTTPS. This is intended only to unlock secure-context browser APIs such as mobile camera access on a trusted LAN.

To enable it for the production profile, edit `.env` before rebuilding:

```dotenv
COMPOSE_PROFILES=prod
LOCAL_HTTPS_CERT_SANS=DNS:localhost,IP:127.0.0.1,IP:192.168.1.50
HTTPS_ENABLED=true
HTTPS_CERT_FILE=/app/certs/local-cert.pem
HTTPS_KEY_FILE=/app/certs/local-key.pem
# If dev is already using host port 3000:
# APP_HOST_PORT=3001
```

Replace `192.168.1.50` with the home-server LAN IP or add `DNS:your-hostname` for the exact hostname you will use in the browser. Then rebuild and start:

```bash
docker compose build --no-cache app
docker compose up -d
```

Browse to `https://<matching-host-or-ip>:3000` (or `:3001` if you set `APP_HOST_PORT=3001`). When enabled, the app serves HTTPS on the configured app host port instead of HTTP; set `HTTPS_ENABLED=false` to keep existing HTTP behavior. Phones and browsers must trust or explicitly accept the self-signed certificate; if the URL host/IP is not in `LOCAL_HTTPS_CERT_SANS`, browser security checks will still fail. Changing SAN values requires rebuilding the app image because the certificate is generated during Docker build.

### Scanner OCR and catalog readiness

The Docker `app` and `app-dev` images install the Tesseract CLI, English OCR data, and ImageMagick for optional ROI polarity/contrast preprocessing. The default Docker paths are:

```dotenv
TESSERACT_BIN=/usr/bin/tesseract
IMAGEMAGICK_BIN=magick
```

To verify OCR and catalog readiness from the phone/LAN URL:

```bash
curl -k "https://<host-or-ip>:3000/api/scanner/status"
```

Native companion scanners can bypass server-side image OCR and ask the cached catalog resolver to resolve on-device OCR text:

```bash
curl -k -X POST "https://<host-or-ip>:3000/api/scanner/resolve-text" \
  -H "Content-Type: application/json" \
  -d '{"rawText":"UNL • 209/219","region":"bottom-right","confidence":0.91}'
```

Optional `setCodeHint` can narrow exact-name fallback when ML Kit reads a clear card name but misses the printed ID. Special printed IDs such as rune IDs (`UNL - R02`) resolve by exact cached catalog number; token face IDs such as `UNL - T07` are supported but may return `status: "ambiguous"` with selectable `alternatives` when the cached catalog has multiple products for the same printed token face. The response uses the scanner candidate shape (`candidates`, `errors`) plus `debug.regions[0].rawText` and `debug.regions[0].parsedAttempts`; it is read-only and does not mutate inventory or collections.

`catalog.ready` is `false` until catalog cards are cached in the database. Scanner recognition intentionally resolves against the cached catalog only, so populate it explicitly before live scanning instead of syncing during each frame:

```bash
# Refresh known Riftbound sets and inspect their set codes.
curl -k "https://<host-or-ip>:3000/api/catalog/sets?sync=true"

# Cache cards for every currently exposed Riftbound set (recommended before scanning).
curl -k -X POST "https://<host-or-ip>:3000/api/catalog/sync" \
  -H "Content-Type: application/json" \
  -d '{}'

# Or refresh only one set (example: UNL).
curl -k -X POST "https://<host-or-ip>:3000/api/catalog/sync" \
  -H "Content-Type: application/json" \
  -d '{"setCode":"UNL"}'
```

`POST /api/catalog/sync` without `setCode` refreshes the Riftbound set list first, then syncs cards for every cached set. The response includes `status`, `syncedSets`, `attemptedSets`, total `syncedCards`, and per-set `results`; if one set fails, successful sets remain synced and the response returns `status: "partial"` with per-set errors. If refreshing the set list fails, the response can include `setListError` while still syncing previously cached sets.

For Android/Brave testing, use the exact HTTPS host/IP that was included in `LOCAL_HTTPS_CERT_SANS`, accept/trust the self-signed certificate, open **Scan / Add Cards**, start the camera, choose the rear/macro lens if needed, hold the card so the bottom-left horizontal or bottom-right vertical ID is readable, wait for live detection, tap **Done**, review rows, then tap **Add to Collection**.

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
- Scanner OCR: `TESSERACT_BIN`, `SCANNER_OCR_DEBUG`
- Optional local HTTPS: `HTTPS_ENABLED`, `HTTPS_CERT_FILE`, `HTTPS_KEY_FILE`, `LOCAL_HTTPS_CERT_SANS`

## Testing notes

Tests use Vitest and live alongside source files. The project preference is test-first implementation: write tests, implement behavior, then validate with the relevant package test command or `pnpm test`.
