# Subscription access tests — to implement

These are acceptance criteria, not passing automated tests.

- Active subscriber can authenticate and access authorized operations.
- Expiry at the server-side boundary blocks new login and existing-session API requests.
- Suspension behaves consistently across counter, kitchen, reports, downloads and realtime access.
- Expiry/suspension never deletes or modifies business records.
- Renewal restores access to exactly the same records.
- Grace periods are not assumed: the agreed behaviour is blocked access at expiry.
- Forged browser timestamps or cached client state cannot extend access.
- Platform admin can renew an expired subscription through separate authorization.
