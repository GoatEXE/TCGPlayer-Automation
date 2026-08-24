# TCGPlayer Automation

Self-hosted dashboard for managing duplicate **Riftbound: League of Legends Trading Card Game** inventory for sale on TCGPlayer. It imports card exports, fetches market prices, recommends listing prices, tracks active listings and sales, and keeps the workflow local to a home server.

## What it does

- Imports duplicate cards from TCGPlayer mobile app CSV/TXT exports.
- Fetches Riftbound market prices from the TCGTracking API.
- Calculates recommended listing prices and flags cards that need attention.
- Tracks inventory, order recording, sales, shipments, invoices, and packing slips.
- Sends optional Telegram notifications for pricing and order events, with notification history in the dashboard.

## Runs on

- Node.js 22, TypeScript, pnpm workspaces
- Fastify API in `packages/server`
- Vite + React dashboard in `packages/web`
- PostgreSQL 16 and Redis
- Docker Compose on an Ubuntu home server or local development machine

## Quick start

The repo uses one `docker-compose.yml` with `COMPOSE_PROFILES=dev` or `COMPOSE_PROFILES=prod` in `.env`.

```bash
cp .env.example .env
```

### Development profile

`.env.example` defaults to `COMPOSE_PROFILES=dev`. This starts the API, Vite dev server, PostgreSQL, and Redis with development ports exposed.

```bash
docker compose up
```

- Dashboard: http://localhost:5173 (`VITE_HOST_PORT`)
- API: http://localhost:3000 (`DEV_APP_HOST_PORT`)
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Production profile

Set `COMPOSE_PROFILES=prod` in `.env`, then start the built app:

```bash
docker compose up -d
```

- App and dashboard: http://localhost:3000 (`APP_HOST_PORT`)
- API: http://localhost:3000/api/\* and health check at http://localhost:3000/health
- PostgreSQL and Redis are internal to Docker Compose.

For Android scanner testing, use the local HTTP backend and populate the cached catalog explicitly; native OCR text resolution only matches against cached cards and does not call TCGTracking per frame:

```bash
# If the dev profile is still running on host port 3000, use 3001 for prod:
# APP_HOST_PORT=3001
curl "http://<host-or-ip>:3000/api/scanner/status"
curl -X POST "http://<host-or-ip>:3000/api/catalog/sync" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Local scripts

```bash
pnpm install
pnpm dev             # API + frontend with hot reload
pnpm build           # Build server and web
pnpm test            # Run Vitest tests
pnpm lint            # Run ESLint
pnpm format:check    # Check formatting
```

Server startup runs Drizzle migrations automatically by default; managed deployments use the one-shot migration job. See [.env.example](.env.example) for configuration.

## Documentation

- [Project plan](docs/PROJECT_PLAN.md): architecture, workflow decisions, phase history, and implementation status
- [Development guide](docs/DEVELOPMENT.md): Docker profiles, local scripts, migrations, and operational commands
- [CI/CD](docs/operations/CI-CD.md): GitHub checks, immutable releases, and protected deployment gates
- [Host operations](docs/operations/HOST-OPERATIONS.md): restricted deploy account, backups, rollback, and production safeguards
- [Phase 2 docs](docs/phase2/): scheduler, price history, safeguards, floor-price backend, notifications, CSV diffs
- [Phase 3 docs](docs/phase3/): active listings, sales history, order status, shipments, invoices, packing slips
- [Implementation plans](docs/plans/): sell workflow and expense tracking plans
- [Research notes](docs/research/README.md): TCGPlayer API status, import samples, fees, and alternative marketplace research

## Current limitations

- TCGPlayer API access is treated as unavailable for new integrations, so listing and inventory changes are manual or CSV-assisted.
- TCGPlayer CSV bulk import requires Level 4 seller status; Level 1 workflows rely on dashboard guidance and manual seller-portal entry.
- The app is designed for local-network hosting, not public internet exposure.

## License

Private project.
