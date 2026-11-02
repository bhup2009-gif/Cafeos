import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cloudSQL } from "../lib/cloud/client";
import { credential, platformAudit } from "../lib/cloud/access";
const sql = cloudSQL(),
  id = process.env.CAFEOS_ADMIN_ID || "platform-owner";
try {
  const password = randomBytes(24).toString("base64url"),
    keys = Array.from({ length: 3 }, () =>
      randomBytes(24).toString("base64url"),
    );
  const digest = credential(password),
    filename = `data/platform-credentials-${Date.now()}.txt`;
  await mkdir("data", { recursive: true, mode: 0o700 });
  await sql.begin(async (tx) => {
    if ((await tx`SELECT id FROM cafeos_cloud.admins LIMIT 1`).length)
      throw Error("EXISTS");
    await writeFile(
      filename,
      `CaféOS platform administrator\nAdmin ID: ${id}\nPassword: ${password}\nKey 1: ${keys[0]}\nKey 2: ${keys[1]}\nKey 3: ${keys[2]}\n\nKeep the three keys in separate secure locations. Any ONE key works with the ID and password.\n`,
      { mode: 0o600, flag: "wx" },
    );
    await tx`INSERT INTO cafeos_cloud.admins(id,name,salt,password_hash,keys) VALUES(${id},'Platform owner',${digest.salt},${digest.hash},${tx.json(keys.map((k) => ({ ...credential(k), active: true })))})`;
    await platformAudit(
      id,
      "admin.provisioned",
      "Initial platform administrator",
      tx,
    );
  });
  console.log(
    "Platform admin provisioned. Private credentials saved in " +
      filename +
      ". No credentials printed.",
  );
} catch (e) {
  console.error(
    "Provisioning failed:",
    (e as Error).message === "EXISTS"
      ? "An administrator already exists. Use controlled recovery."
      : (e as { code?: string }).code || "INTERNAL",
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
