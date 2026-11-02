# Cloud pilot verification — 3 November 2026

- Local/domain suite: 49 passing checks, 1 opt-in legacy HTTP check skipped.
- Live Supabase test-project suite: 10 passing checks with disposable fixtures and cleanup.
- Production Next.js build and TypeScript validation pass.
- Browser verified: three-credential platform login, subscriber outlet login, existing POS and cleaned platform subscriber list.
- Verified: per-request in-memory isolation; database RLS prevents alternate-outlet reads; serialized writes and rollback; payment replay and stock integrity; expiry/suspension reject existing sessions; renewal preserves data; all three admin keys; individual key replacement; owner reset; staff-role enforcement; HTTP CSRF; report export access; outlet limit enforcement.
- Encrypted backup created and authenticated decryption checked. A separate empty-project restore drill and off-site automation are still launch tasks.
- Private environment/admin/demo credential files are ignored by Git. The original local POS database was not imported or changed.

This validates a controlled test release, not production capacity. Read deployment.md for aggregate storage limits, online-only operation and remaining operational requirements.
