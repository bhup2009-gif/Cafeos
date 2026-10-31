import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareOrderSwitch } from "../lib/order-switch";
const table1 = { id: "order-1", lines: [{ name: "Chai" }], tableNo: 1 };
const table2 = { id: "order-2", lines: [], tableNo: 2 };

test("switching to a free table saves the current order first", async () => {
  const calls: string[] = [];
  const result = await prepareOrderSwitch(table1, table2, async current => {
    assert.equal(current, table1);
    calls.push("saved");
  }, async target => { calls.push("opened"); return target; });
  assert.deepEqual(calls, ["saved", "opened"]);
  assert.equal(result, table2);
});
test("reopening the same table keeps unsaved edits", async () => {
  const result = await prepareOrderSwitch(table1, { ...table1, lines: [] }, async () => { assert.fail("must not save"); }, async () => { assert.fail("must not replace"); });
  assert.equal(result, table1);
});
test("failed save never replaces the current order", async () => {
  await assert.rejects(prepareOrderSwitch(table1, table2, async () => { throw Error("Order changed on another screen"); }, async () => { assert.fail("must not open"); }), /Order changed/);
  assert.equal(table1.lines.length, 1);
});
test("empty draft switches without saving and uses latest destination order", async () => {
  const latest = { ...table1, lines: [{ name: "Pizza" }] };
  const result = await prepareOrderSwitch(table2, table1, async () => { assert.fail("empty drafts need no save"); }, async () => latest);
  assert.equal(result, latest);
});

test("saved table assignment is recovered without losing unsaved item edits", async () => {
  const { restoreTableAssignment } = await import("../lib/order-switch");
  const saved = { ...table1, mode: "Dine-in", tableNo: 2 };
  const broken = { ...saved, tableNo: null as number | null, lines: [{ name: "Samosa" }] };
  const restored = restoreTableAssignment(broken, saved);
  assert.equal(restored.tableNo, 2);
  assert.equal(restored.lines[0].name, "Samosa");
});
test("unassigned dine-in items follow the chosen free table without saving an invalid draft", async () => {
  const current = { ...table1, mode: "Dine-in", tableNo: null as number | null };
  const target = { ...table2, mode: "Dine-in", tableNo: 3 as number | null };
  const result = await prepareOrderSwitch(current, target, async () => { assert.fail("must not save without a table"); }, async t => t, async (d, t) => ({ ...d, tableNo: t.tableNo }));
  assert.equal(result.tableNo, 3);
  assert.deepEqual(result.lines, current.lines);
});
test("unassigned draft is preserved before an occupied table opens", async () => {
  const current = { ...table1, mode: "Dine-in", tableNo: null as number | null };
  const target = { ...table2, mode: "Dine-in", lines: [{ name: "Pizza" }], tableNo: 2 as number | null };
  let parked = false;
  const result = await prepareOrderSwitch(current, target, async () => { assert.fail("invalid draft must not be saved"); }, async t => t, async (d, t) => { assert.equal(d, current); parked = true; return t; });
  assert.ok(parked);
  assert.equal(result, target);
});
test("every table may have its own running order", async () => {
  const saved = new Map<number, typeof table1>();
  let current = { ...table1, mode: "Dine-in" };
  for (let n = 2; n <= 12; n++) {
    const target = { id: `order-${n}`, mode: "Dine-in", tableNo: n, lines: [] as { name: string }[] };
    const next = await prepareOrderSwitch(current, target, async d => { saved.set(d.tableNo, d); }, async d => d);
    current = { ...next, lines: [{ name: `Table ${n} item` }] };
  }
  saved.set(current.tableNo, current);
  assert.equal(saved.size, 12);
  assert.equal(saved.get(1)!.lines[0].name, "Chai");
});
