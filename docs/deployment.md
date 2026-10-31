# Vercel deployment plan

## Current status

Only deployment structure/templates are created. Existing local app behaviour is unchanged. No cloud account, database or deployment has been created. The Vercel build is deliberately blocked by `scripts/check-cloud-readiness.mjs` because the app still uses local SQLite and local account provisioning. This gate is an implementation-readiness check, not a request for user approval.

## Local development

Use existing `npm run dev`, `npm run build` and `npm run typecheck`. New cloud variables in `.env.example` are placeholders and have no runtime effect. Existing start scripts remain unchanged.

## Implementation sequence

1. Back up the local database using a consistent SQLite backup procedure; keep an independent copy and inventory record counts/totals. Do not commit or upload `data/`.
2. Build and review PostgreSQL schema, memberships, outlet scopes, constraints, policies and migrations. Provision separate development/preview/production projects.
3. Replace local database access with transactional cloud queries. Preserve idempotency, stale-version checks, stock/money integrity and tenant-scoped numbering.
4. Implement cloud authentication, roles, session revocation, subscription checks and the three-key platform login. Add recovery and audit records.
5. Build platform subscriber/outlet/subscription management and subscriber workspace routes. Expiry retains data and blocks access. Verify renewal restores records.
6. Implement and dry-run the import script against a test database: validate IDs, relationships, counts and financial totals. Stop writes during final cutover or implement a verified delta strategy. Keep a rollback procedure.
7. Connect storage, kitchen updates, emails, encrypted backups and monitoring. Test touch/browser printing. Define offline behaviour explicitly.
8. Complete tenant isolation, expiry, concurrency, migration and recovery/restore checks. Replace the scaffold build blocker with real configuration/readiness validation only when cloud runtime is implemented.

## Vercel project settings (when ready)

- Connect the application source repository; set Root Directory to `pos` if the repository contains its parent workspace, otherwise use the application repository root.
- Framework: Next.js. Keep the Node runtime compatible with `package.json` and the chosen Vercel runtime.
- `vercel.json` defines the build command; local `npm run build` remains independent.
- Set environment variables in Vercel, using isolated preview credentials. Never store secret keys under `NEXT_PUBLIC_*`.
- Configure the production domain, HTTPS origins, authentication callback/recovery URLs and database connection pooling.
- Keep backups/data migration out of build steps. No SQLite persistent-file fallback in cloud production.
- Use a Vercel plan that permits commercial use and select production database/backup capacity before real outlets depend on the service. Recheck provider plans at launch.

## Release checks

Use the checklists in `tests/tenant-isolation/README.md`, `tests/subscription-access/README.md` and `docs/recovery-and-backups.md`. Deploy to staging first. Confirm no sample credentials/real local data are bundled. Test production configuration and rollback independently from database rollback; rolling back code does not reverse schema or data changes.
