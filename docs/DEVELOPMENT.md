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
APP_BIND_ADDRESS=0.0.0.0 # prod bind; restrict with host firewall rules
APP_HOST_PORT=3000       # prod app host port
DEV_APP_HOST_PORT=3000   # dev API host port
VITE_HOST_PORT=5173      # dev dashboard host port
```

If the dev profile is already running and you need the production profile at the same time, either stop dev first:

```bash
docker compose down
```

or set a different production host port in `.env` before starting prod:

```dotenv
COMPOSE_PROFILES=prod
APP_HOST_PORT=3001
```

Then use `http://<host-or-ip>:3001` for production HTTP instead of port `3000`.

### Owned collection CSV workflow

The retained collection workflow is web/CSV based:

1. Open the dashboard **Collection** view and choose the owned collection.
2. Preview a TCGPlayer collection CSV, then commit it with **Set quantities** for a current export or **Add to existing quantities** for incremental acquisitions.
3. Review sellability recommendations. Tokens/runes stay excluded, and unknown classifications stay safe until reviewed.
4. Preview and explicitly move selected rows to Selling Inventory. Transfers create Ready-to-List staging rows and never modify existing listed inventory or create TCGPlayer listings.

The import path resolves by `Product ID` when possible and can create a local catalog snapshot from a sufficiently identified CSV row. General catalog APIs remain available for catalog inspection and refreshes; use `POST /api/catalog/sync` to refresh Riftbound set/card data when needed. See [collection-sellability.md](collection-sellability.md) for endpoint details, CSV matching behavior, and clear/transfer safeguards.

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
docker compose down               # Stop and remove containers, preserving data
docker compose logs -f app        # Follow production app logs
docker compose logs -f app-dev    # Follow development app logs
docker compose build              # Rebuild images
```

## Migrations

The server runs Drizzle migrations during startup before registering API routes by default. This preserves local/dev behavior. If migrations fail, startup fails fast and the error appears in container logs.

Managed production deployment sets `RUN_MIGRATIONS_ON_START=false` and runs the image's dedicated one-shot migration command before replacing the app. Local/manual migration commands remain available through the server package scripts:

```bash
pnpm --filter server db:migrate       # development Drizzle CLI
pnpm --filter server migrate:run      # compiled production migration entrypoint
```

The named volumes are shared by the existing profile design and are explicitly preserved as `tcgplayer-automation_pgdata` and `tcgplayer-automation_redisdata`. Never use `docker compose down -v` against this project.

## Configuration

Use `.env.example` as the source of truth for environment variables. Important groups include:

- Docker profile and host ports: `COMPOSE_PROFILES`, `APP_HOST_PORT`, `DEV_APP_HOST_PORT`, `VITE_HOST_PORT`
- Database: `POSTGRES_*`, `DATABASE_URL`
- Redis: `REDIS_URL`
- Pricing: `LISTING_PRICE_MULTIPLIER`, `MAX_PRICE_DROP_PERCENT`
- Scheduler: `PRICE_CHECK_INTERVAL_HOURS`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, notification toggles
- Seller info for invoice and packing slip templates

## Testing notes

Tests use Vitest and live alongside source files. The project preference is test-first implementation: write tests, implement behavior, then validate with the relevant package test command or `pnpm test`.
