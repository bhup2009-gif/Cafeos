# Tenant isolation tests — to implement

These are acceptance criteria, not passing automated tests.

- Subscriber A cannot read/update/export Subscriber B data using guessed IDs.
- Every order, kitchen ticket, stock event, customer, supplier, payroll row, file and report is scoped.
- Staff can only access assigned outlets and allowed roles.
- Database policies and server authorization both enforce boundaries.
- Service-role operations require explicit authorized tenant scope.
- Replay/idempotency keys, invoice numbers, sessions and offline caches do not collide across tenants.
- Platform administrative actions require separate authorization and leave audit records.
- Anonymous access and invalid/missing tenant context fail closed.
