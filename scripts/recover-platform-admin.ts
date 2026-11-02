// Privileged server operator tool. Requires private database credentials, never served over HTTP.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cloudSQL } from "../lib/cloud/client";
import { credential, platformAudit } from "../lib/cloud/access";
const id = process.env.CAFEOS_RECOVERY_ADMIN_ID;
if (!id || process.argv[2] !== "--rotate-all") {
  console.error(
    "Set CAFEOS_RECOVERY_ADMIN_ID and pass --rotate-all. This revokes all admin sessions and replaces password and all three keys.",
  );
  process.exitCode = 1;
} else {
  const sql = cloudSQL();
  try {
    const password = randomBytes(24).toString("base64url"),
      keys = Array.from({ length: 3 }, () =>
        randomBytes(24).toString("base64url"),
      ),
      digest = credential(password),
      file = `data/platform-recovery-${Date.now()}.txt`;
    await mkdir("data", { recursive: true, mode: 0o700 });
    await sql.begin(async (tx) => {
      if (
        !(
          await tx`SELECT id FROM cafeos_cloud.admins WHERE id=${id} FOR UPDATE`
        ).length
      )
        throw Error("MISSING");
      await writeFile(
        file,
        `Admin ID: ${id}\nPassword: ${password}\nKey 1: ${keys[0]}\nKey 2: ${keys[1]}\nKey 3: ${keys[2]}\n`,
        { mode: 0o600, flag: "wx" },
      );
      await tx`UPDATE cafeos_cloud.admins SET salt=${digest.salt},password_hash=${digest.hash},keys=${tx.json(keys.map((k) => ({ ...credential(k), active: true })))} WHERE id=${id}`;
      await tx`DELETE FROM cafeos_cloud.admin_sessions WHERE admin_id=${id}`;
      await platformAudit("server-operator", "admin.recovered", id, tx);
    });
    console.log(
      "Recovery complete. Replacement credentials saved privately in " + file,
    );
  } catch (e) {
    console.error(
      "Recovery failed:",
      (e as { code?: string }).code || "Check administrator ID",
    );
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
