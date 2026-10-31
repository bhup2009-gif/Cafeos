# Cloud database adapter — planned

Target: Supabase PostgreSQL using server-side connections with appropriate pooling.
The active local adapter remains `lib/db.ts` (SQLite); this folder does not replace it yet.
Cloud work must preserve transactions, version conflicts, idempotency, money precision and per-outlet order numbering. Tenant-scope operation IDs, sessions and all business records.
Service-role secrets stay server-only; database policies and grants must protect tenant boundaries. Backups and migrations run separately from application builds.
