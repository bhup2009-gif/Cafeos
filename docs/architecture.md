# Cloud architecture

Vercel Node 24 handles requests. PostgreSQL schema `cafeos_cloud` stores subscriber subscriptions, outlets, sessions, administrator hashes and audit records. `public` schema is not used; browser Supabase database access is not enabled by this app.

The first cloud release uses a per-outlet JSONB aggregate, hydrated into an isolated in-memory SQLite engine through AsyncLocalStorage. Existing synchronous domain transactions remain unchanged. PostgreSQL transactions lock the outlet and subscriber on writes, run the domain operation, then replace the aggregate atomically. Exceptions roll back the remote write. Reads hydrate an independent copy; no global outlet state is reused. Local SQLite is lazy and unavailable in cloud mode outside an authenticated outlet scope.

Opaque session hashes resolve the outlet on the server. Browser-supplied outlet IDs only locate login accounts, never authorize ongoing requests. The server sets transaction-local outlet scope and switches to the restricted `cafeos_outlet_runtime` role for reading/writing aggregates. PostgreSQL RLS rejects other outlets. Central authentication and platform operations use server database credentials and explicit server authorization. Never send database credentials to the browser.

Every protected request checks subscriber status and exact expiry timestamp. Staff passwords and role changes revoke staff sessions; admin key replacement revokes admin sessions. Three alternative keys are not MFA. Tenants/outlets are never deleted by subscription commands.

Platform administrators manage subscribers, additional outlets, limits, renewals, suspension and owner recovery. Subscriber owners/managers manage their own staff. Platform sessions cannot act as subscriber sessions and vice versa. Each outlet has separate staff identities in this pilot.

For scale, normalize aggregates into scoped PostgreSQL tables and add pagination, connection/load budgets and archive reads. The current whole-state design and 32 MiB aggregate cap are intended for controlled testing. Backups, printer bridges, offline sync, external payment/delivery integrations and notification delivery need separate operations/integrations; see deployment.md.
