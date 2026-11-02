import { createCipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cloudSQL } from "../lib/cloud/client";
await mkdir("data", { recursive: true, mode: 0o700 });
let key: Buffer;
try {
  key = Buffer.from(
    (await readFile("data/cloud-backup.key", "utf8")).trim(),
    "hex",
  );
} catch {
  key = randomBytes(32);
  await writeFile("data/cloud-backup.key", key.toString("hex"), {
    mode: 0o600,
    flag: "wx",
  });
}
if (key.length !== 32) throw Error("Invalid backup encryption key");
const sql = cloudSQL();
try {
  const snapshot = await sql.begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const data: Record<string, unknown> = {
        version: 1,
        createdAt: new Date().toISOString(),
      };
      for (const table of ["tenants", "outlets", "admins", "audit"])
        data[table] = await tx.unsafe(`SELECT * FROM cafeos_cloud.${table}`);
      return data;
    },
  );
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce),
    encrypted = Buffer.concat([
      cipher.update(JSON.stringify(snapshot), "utf8"),
      cipher.final(),
    ]);
  const file = `data/cloud-backup-${Date.now()}.enc`;
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      nonce: nonce.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      data: encrypted.toString("base64"),
    }),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Encrypted backup saved: " +
      file +
      ". Keep cloud-backup.key separately and copy both to secure off-site locations.",
  );
} catch (e) {
  console.error("Backup failed:", (e as { code?: string }).code || "INTERNAL");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
