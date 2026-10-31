# Database migrations — pending design

Add timestamped SQL migrations after the schema is reviewed. No executable schema is supplied in this scaffold.
Required entities: subscribers, outlets, memberships, subscriptions, platform administrators, access-key hashes, recovery tokens, audit events and all existing business records.
Tenant/outlet ownership, row-level security policies, role grants, transaction integrity, retention and unique constraints must be covered together. Never implement expiry using cascading deletion.
