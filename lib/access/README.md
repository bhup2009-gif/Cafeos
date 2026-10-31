# Access enforcement — planned

Implement server-side identity, role, tenant/outlet membership and subscription checks.
An outlet ID supplied by the browser is not authorization. Platform-admin access must be separate from subscriber roles. Check expiry on every protected operation; revoke sessions on reset/suspension.
Use database isolation policies alongside scoped queries. No permissive placeholder authorization helpers are provided.
