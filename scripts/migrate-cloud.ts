import { readFile } from "node:fs/promises";
import { cloudSQL } from "../lib/cloud/client";
const sql = cloudSQL();
try {
  await sql.begin(async (tx) => {
    await tx.unsafe(
      await readFile(
        new URL(
          "../supabase/migrations/202611030001_cloud.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  });
  console.log(
    "Cloud schema migration applied. Existing business data was not imported or changed.",
  );
} catch (e) {
  console.error(
    "Cloud migration failed:",
    (e as { code?: string }).code || "INTERNAL",
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
