# CaféOS cloud test deployment

## Implemented

- Next.js app on Vercel Node 24, with Supabase PostgreSQL persistence.
- `/`, `/login` and `/pos`: subscriber workspace; `/platform`: platform administration.
- Outlet ID plus individual staff ID/password; role checks and persistent session revocation.
- Platform admin ID/password plus any ONE of three independently replaceable access keys.
- Subscriber plans, per-subscriber outlet limits, expiry, suspension, renewal and owner credential reset.
- Expiry/suspension blocks login, active-session requests, images, reports and exports. It never deletes business data. Renewal restores access to retained records.
- Existing billing engine, transaction/idempotency checks and all existing business modules.

## First release scope

This is a cloud test/pilot release. Each outlet is stored as a versioned PostgreSQL JSONB record. Its existing synchronous billing engine runs in an isolated in-memory SQLite instance per request; no SQLite file is written on Vercel. A PostgreSQL row lock serializes mutations. Server-established scope plus a restricted non-login database role/RLS protects outlet data. No public Supabase Data API or service-role key is used.

The aggregate-per-outlet design preserves the existing calculations while enabling cloud testing. It loads the outlet's state for each request and has a 32 MiB safety limit; large histories require pagination and normalized PostgreSQL tables before broad rollout. Requests from an outlet serialize, so load testing against expected counter volume is required. Kernel/session data is not shared across outlets. Each outlet has independent staff accounts; cross-outlet single sign-on is not implemented.

Cloud operation is online-only. Financial snapshots/drafts are not cached in cloud mode; use Hold or Send to save. Kitchen updates poll every 10 seconds. Browser printing works; silent printers, aggregator order imports, payment processing and marketing sending remain separate integrations. Tax configuration remains demo configuration.

## Configuration

Use the `.env.example` names. Only these server variables are required for Vercel:

- `DATABASE_URL`: shared transaction pooler, port 6543, with URL-encoded password.
- `SUPABASE_CA_CERT`: complete official Supabase root CA PEM, with real line breaks.
- `CAFEOS_STORAGE=cloud`: explicit for local cloud testing; Vercel always enforces cloud mode.

Do not upload `.env.local`, `data/`, credentials or backup files. Preview and production must use separate Supabase databases before serving real subscribers. The current configured project is for testing only.

## Provisioning (run separately from builds)

1. `npm ci` with Node 24.15 or later in the Node 24 series.
2. Put private cloud connection and certificate in `.env.local`.
3. `npm run db:migrate` applies the additive private schema. It does not import local records.
4. `npm run admin:provision` creates the initial platform owner only if no administrator exists. Credentials are generated into an owner-only file under `data/`, never printed or committed. Keep the three keys separately.
5. Run `npm run test`, `npm run test:cloud`, `npm run typecheck`, and `npm run build`.
6. Open `/platform`, then create a subscriber/outlet with an expiry, limit and owner password. Owner staff ID is `owner`; use Staff to create counter/kitchen accounts. Share credentials privately.

The authorized Supabase test project has already received the schema and initial admin. Do not rerun provisioning to overwrite it.

## Vercel

- Import `bhup2009-gif/Cafeos`, root directory `./`, framework Next.js, Node 24.
- Use the checked-in lockfile (`npm ci`) and build command from `vercel.json`.
- Set the three variables above in the intended deployment environment. Use Vercel Pro for commercial use.
- The build checker validates configuration without connecting or changing the schema. No migrations or account provisioning run during deployment.
- Deploy a protected test environment first. Configure your domain after end-to-end checks. Cookie security is enabled automatically on HTTPS.
- Do not put real production data into a deployment whose preview URLs or project permissions allow unintended access.

## Existing local data

The original `pos/data/cafeos.sqlite` remains untouched. `scripts/migrate-local-data.ts` defaults to dry run. Use a consistent SQLite backup, set `CAFEOS_IMPORT_FILE` and `CAFEOS_IMPORT_OUTLET`, review counts/totals, then pass `--apply` only for an empty target outlet. Import excludes sessions and verifies imported orders inside the transaction. Cutover and backup/rollback planning are still required before real migration.

## Before a real production launch

Arrange automatic off-site backups, a verified restore drill, external uptime monitoring, operational support, a retention policy and capacity/load testing. The encrypted backup/restore utilities are included, but no recurring backup scheduler or off-site account is configured. Email recovery and notifications require an email provider and remain unimplemented. Admin recovery currently uses the restricted server tool. These are material launch tasks, not features provided by Vercel deployment itself.
