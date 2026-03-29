# TCGPlayer Automation

A self-hosted web application for automating TCGPlayer selling workflows. Built for managing Riftbound TCG duplicate cards — from collection import through listing, price monitoring, and sales tracking.

## Features (Planned)

- **Card Ingestion** — Import cards via CSV export or manual entry
- **Automated Listing** — Push listings to TCGPlayer via Seller API
- **Price Monitoring** — Lazy daily price checks with auto-adjustment (98% market price)
- **Sales Dashboard** — Track active listings, sales history, and shipments
- **Invoice/Packing Slip** — Print-ready documents from the dashboard
- **Telegram Notifications** — Get notified when cards sell

## Tech Stack

- **Backend:** Node.js / TypeScript
- **Frontend:** TBD (React or similar)
- **Database:** PostgreSQL (via Docker)
- **Deployment:** Docker Compose on Ubuntu Linux
- **External API:** TCGPlayer Seller API

## Getting Started

> Project is in initial planning phase. See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for the full roadmap.

## Development

```bash
# Coming soon
docker compose up
```

## License

Private — All rights reserved.
