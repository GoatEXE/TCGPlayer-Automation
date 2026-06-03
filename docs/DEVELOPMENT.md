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
- Vite dev server on `localhost:5173`
- API server on `localhost:3000`

### Production

```bash
cp .env.example .env
# edit .env and set COMPOSE_PROFILES=prod
docker compose up -d
```

Production mode starts the built `app` service on `localhost:3000`. The frontend is served by the server at `/`, API routes are under `/api/*`, and PostgreSQL/Redis are internal Docker services.

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

- Docker profile: `COMPOSE_PROFILES`
- Database: `POSTGRES_*`, `DATABASE_URL`
- Redis: `REDIS_URL`
- Pricing: `MIN_LISTING_PRICE_CENTS`, `LISTING_PRICE_MULTIPLIER`, `MAX_PRICE_DROP_PERCENT`
- Scheduler: `PRICE_CHECK_INTERVAL_HOURS`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, notification toggles
- Seller info for invoice and packing slip templates

## Testing notes

Tests use Vitest and live alongside source files. The project preference is test-first implementation: write tests, implement behavior, then validate with the relevant package test command or `pnpm test`.
