import assert from "node:assert/strict";
// Explicit, non-overwriting import into an empty, existing outlet. Default is dry run.
import { DatabaseSync } from "node:sqlite";
import { cloudSQL } from "../lib/cloud/client";
import { dumpDatabase } from "../lib/db";
import { platformAudit } from "../lib/cloud/access";
const source = process.env.CAFEOS_IMPORT_FILE,
  outlet = process.env.CAFEOS_IMPORT_OUTLET;
if (!source || !outlet) {
  console.error(
    "Set CAFEOS_IMPORT_FILE to a consistent SQLite backup and CAFEOS_IMPORT_OUTLET to the target outlet ID. Dry run is default; --apply imports.",
  );
  process.exitCode = 1;
} else {
  const database = new DatabaseSync(source, { readOnly: true });
  const state = dumpDatabase(database);
  database.close();
  state.sessions = [];
  state.login_attempts = [];
  const orders = (state.orders || []).map((o) => JSON.parse(o.data as string));
  console.log(
    JSON.stringify({
      orders: orders.length,
      total: orders.reduce((n, o) => n + o.total, 0),
      products: state.products?.length,
      users: state.users?.length,
    }),
  );
  if (process.argv.includes("--apply")) {
    const sql = cloudSQL();
    try {
      await sql.begin(async (tx) => {
        const [row] =
          await tx`SELECT id,state FROM cafeos_cloud.outlets WHERE code=${outlet.toUpperCase()} FOR UPDATE`;
        if (!row) throw Error("Target outlet not found");
        if (
          row.state.orders?.length ||
          row.state.audit?.length ||
          row.state.customers?.length
        )
          throw Error("Target outlet must be empty");
        await tx`UPDATE cafeos_cloud.outlets SET state=${tx.json(state as any)},version=version+1 WHERE id=${row.id}`;
        const [check] =
          await tx`SELECT state FROM cafeos_cloud.outlets WHERE id=${row.id}`;
        assert.deepEqual(
          check.state.orders,
          state.orders,
          "Imported orders differ",
        );
        await platformAudit(
          "server-operator",
          "outlet.imported",
          `${outlet}: ${orders.length} orders`,
          tx,
        );
      });
      console.log(
        "Import verified. Source backup untouched; sessions were excluded.",
      );
    } catch (e) {
      console.error(
        "Import rolled back:",
        (e as { code?: string }).code || (e as Error).message,
      );
      process.exitCode = 1;
    } finally {
      await sql.end({ timeout: 5 });
    }
  } else console.log("Dry run only. No cloud changes made.");
}
