import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cloudSQL } from "../lib/cloud/client";
if (
  !process.env.CAFEOS_BACKUP_FILE ||
  process.env.CAFEOS_RESTORE_CONFIRM !== "EMPTY_DATABASE_ONLY"
)
  throw Error(
    "Set CAFEOS_BACKUP_FILE and CAFEOS_RESTORE_CONFIRM=EMPTY_DATABASE_ONLY; apply the schema to a separate empty database first.",
  );
const key = Buffer.from(
  (await readFile("data/cloud-backup.key", "utf8")).trim(),
  "hex",
);
const envelope = JSON.parse(
  await readFile(process.env.CAFEOS_BACKUP_FILE, "utf8"),
);
const decipher = createDecipheriv(
  "aes-256-gcm",
  key,
  Buffer.from(envelope.nonce, "hex"),
);
decipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
const state = JSON.parse(
  Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8"),
);
if (state.version !== 1) throw Error("Unsupported backup");
const sql = cloudSQL();
try {
  await sql.begin(async (tx) => {
    for (const table of ["tenants", "outlets", "admins", "audit"]) {
      if (
        (await tx.unsafe(`SELECT 1 FROM cafeos_cloud.${table} LIMIT 1`)).length
      )
        throw Error("Restore target is not empty");
    }
    for (const t of state.tenants)
      await tx`INSERT INTO cafeos_cloud.tenants(id,name,plan,status,max_outlets,expires_at,created_at) VALUES(${t.id},${t.name},${t.plan},${t.status},${t.max_outlets},${t.expires_at},${t.created_at})`;
    for (const o of state.outlets) {
      o.state.sessions = [];
      o.state.login_attempts = [];
      await tx`INSERT INTO cafeos_cloud.outlets(id,tenant_id,code,name,state,version,created_at) VALUES(${o.id},${o.tenant_id},${o.code},${o.name},${tx.json(o.state)},${o.version},${o.created_at})`;
    }
    for (const a of state.admins)
      await tx`INSERT INTO cafeos_cloud.admins(id,name,salt,password_hash,keys,created_at) VALUES(${a.id},${a.name},${a.salt},${a.password_hash},${tx.json(a.keys)},${a.created_at})`;
    for (const a of state.audit)
      await tx`INSERT INTO cafeos_cloud.audit(id,actor,action,detail,created_at) VALUES(${a.id},${a.actor},${a.action},${a.detail},${a.created_at})`;
  });
  console.log(
    "Backup restored into empty database. All users must sign in again.",
  );
} catch (e) {
  console.error(
    "Restore rolled back:",
    (e as { code?: string }).code || (e as Error).message,
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
