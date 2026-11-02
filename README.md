# CaféOS

Next.js 16 / React / TypeScript café POS with cloud outlet management and an optional local SQLite development mode.

See [deployment guide](docs/deployment.md) for Vercel configuration, [architecture](docs/architecture.md) for isolation and pilot limits, and [recovery/backups](docs/recovery-and-backups.md) for operator procedures.

## Start

Use Node 24.15+ in the Node 24 series, run `npm ci`, configure a private `.env.local` from `.env.example`, then `npm run dev`. The cloud project must be migrated/provisioned separately. Never commit data or credentials.

Routes: `/login` or `/pos` for subscribers; `/platform` for platform administration. Subscriber login uses outlet ID and individual staff credentials. Admin login uses ID, password and any one of three access keys.

## Verify

`npm test`, `npm run typecheck`, `npm run build`. `npm run test:cloud` uses temporary cloud fixtures and requires the private test-database environment. Do not run cloud tests against a production project. HTTP legacy tests are opt-in via `CAFEOS_TEST_URL`.

This is a controlled cloud test/pilot release. It requires internet, polls kitchen updates, uses a per-outlet PostgreSQL aggregate with an in-memory transactional engine, and has not been load-qualified for broad production. Production backup automation, restore drills, email recovery, offline synchronization and hardware integrations remain separate work. Existing local café data is not automatically imported.
