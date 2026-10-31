# Recovery and backups — implementation checklist

Status: planned; no recovery mechanism or scheduled backups are installed by this scaffold.

## Lost credentials

One lost access key: use another of the three, revoke the missing key, issue a replacement. Password/all keys lost: verified recovery email with expiring single-use reset tokens, rate limits, audit records and session revocation. Never disclose whether an arbitrary email is an administrator.

## Admin UI or login failure

Keep authorized hosting/database access independent from CaféOS login. Implement `scripts/recover-platform-admin.ts` as a controlled server-side tool with explicit identity verification, secret-safe input and audit records. It must not become a public bypass or a permanent master password. Document access ownership and recovery steps in a secure location outside this app.

## Data recovery

Configure automatic encrypted database backups plus a copy in a separate storage/account boundary. Include uploaded assets and required configuration; database backups alone do not preserve every file. Set recovery point/time targets, backup frequency and retention before launch. Expired subscribers remain covered by backups and retention. No subscription job may delete their records.

Monitor backup success and perform scheduled restore drills in an isolated environment. Keep migration/cutover backups. Record what writes would be lost at a restore point; verify bill totals, relationships, tenant policies and login after recovery. Never copy production data to public preview environments.
