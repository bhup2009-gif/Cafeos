# Supabase foundation

No cloud project has been created or linked. No production SQL has been applied.

- `migrations/`: reviewed schema, constraints, indexes, grants and tenant isolation policies.
- `seed.sql`: local/development data only, currently a no-op.

Use separate development, preview and production projects. Preview deployments must never receive production database credentials. Review migrations and test access policies before applying them. Do not run production migrations automatically during Vercel preview builds.
