# CaféOS cloud architecture — proposed foundation

Status: structure only. The operational app is still local SQLite at `/`. `/login`, `/activate`, `/recovery`, `/pos` and `/platform` are reserved folders, not functioning routes.

## Intended deployment

- Vercel hosts Next.js UI and server request handlers.
- Supabase PostgreSQL persists identity, subscribers, outlets and business data.
- Supabase Storage stores assets; realtime updates synchronize counter/kitchen views.
- An email provider delivers activation, recovery and subscription notifications.
- Separate encrypted backups and external monitoring support recovery.

## Access model

Platform administrators manage the service. Subscriber owners manage their own business; managers, cashiers and kitchen staff have restricted roles and assigned outlets.
Every operation must authorize identity, role, subscriber/outlet and subscription state. Client-provided IDs never grant access. Public Supabase access requires tested row-level security and grants; server credentials must not bypass application checks accidentally.

Admin login: admin ID + password + any one of three separately hashed/revocable keys. This is not MFA. Recovery follows `recovery-and-backups.md`.

Subscription expiry/suspension blocks login and protected requests for active sessions, but retains records. Renewal restores access to the same data. Retention is independent of subscription state.

## Existing behaviour to preserve

Billing and stock changes remain atomic and replay-safe. Keep optimistic versions, integer money, role checks, kitchen item actions, audit history, backdated entries and exports. Scope cache/offline data to user, subscriber and outlet and clear accessible caches on logout or account switching.

## Release boundaries

First cloud release: online billing, tables, kitchen, inventory, expenses, salary accounts, contacts, exports and browser printing after migration/testing.
Offline billing/sync, silent printer bridges, payment processing, delivery-provider APIs and marketing delivery are separate integrations. Provider selection currently labels orders; it does not import external orders.
