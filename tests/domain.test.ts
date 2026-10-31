import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const folder = mkdtempSync(join(tmpdir(), "cafeos-test-"));
process.env.CAFEOS_DATA_DIR = folder;
process.env.CAFEOS_DEMO_PASSWORD = "test-password-123";
const { execute, snapshot } = await import("../lib/service");
const { totals } = await import("../lib/money");
const { db } = await import("../lib/db");
const { login, authenticate } = await import("../lib/auth");
const owner = { id: "owner", name: "Owner", role: "owner" } as const,
  cashier = { id: "cashier", name: "Cashier", role: "cashier" } as const,
  barista = { id: "barista", name: "Barista", role: "barista" } as const;
const command = (
  action: string,
  payload: unknown,
  user: typeof owner | typeof cashier | typeof barista = owner,
  operationId = crypto.randomUUID(),
) => execute(user, { operationId, action, payload });
const draft = (id = crypto.randomUUID()) => ({
  id,
  version: 0,
  mode: "Takeaway",
  tableNo: null,
  customer: "Ananya",
  discountBps: 0,
  lines: [
    {
      id: crypto.randomUUID(),
      productId: "cappuccino",
      qty: 1,
      size: "Large",
      addons: ["Oat milk", "Extra shot"],
      note: "Less sugar",
    },
    {
      id: crypto.randomUUID(),
      productId: "sandwich",
      qty: 2,
      size: "Regular",
      addons: [],
      note: "",
    },
    {
      id: crypto.randomUUID(),
      productId: "brownie",
      qty: 1,
      size: "Regular",
      addons: [],
      note: "",
    },
  ],
});
test("integer tax and discount allocation, including half-paise rounding", () => {
  assert.deepEqual(
    totals(
      [
        { qty: 1, price: 16000, taxBps: 500 },
        { qty: 1, price: 26000, taxBps: 500 },
      ],
      1000,
    ),
    { subtotal: 42000, discount: 4200, tax: 1890, total: 39690 },
  );
  assert.equal(totals([{ qty: 1, price: 101, taxBps: 500 }], 0).tax, 5);
  assert.throws(() => totals([], 10001));
});
test("three-product order, modifier pricing, two stations, stock idempotency and checkout replay", () => {
  const before = snapshot(owner);
  const o = command("saveOrder", draft());
  assert.equal(o.lines.length, 3);
  assert.equal(o.lines[0].price, 27500);
  assert.equal(o.subtotal, 94500);
  assert.equal(o.total, 99225);
  const key = crypto.randomUUID();
  const sent = command(
    "sendKitchen",
    { id: o.id, version: o.version },
    owner,
    key,
  );
  const after = snapshot(owner);
  assert.equal(after.tickets.length - before.tickets.length, 2);
  assert.equal(
    after.ingredients.find((i) => i.id === "oat")!.stock,
    before.ingredients.find((i) => i.id === "oat")!.stock - 225,
  );
  assert.equal(
    after.ingredients.find((i) => i.id === "milk")!.stock,
    before.ingredients.find((i) => i.id === "milk")!.stock,
  );
  command("sendKitchen", { id: o.id, version: o.version }, owner, key);
  assert.deepEqual(snapshot(owner).ingredients, after.ingredients);
  const paymentKey = crypto.randomUUID();
  const payload = {
    id: o.id,
    version: sent.version,
    payments: [
      { method: "cash", amount: 50000 },
      {
        method: "upi",
        amount: 49225,
        reference: "UPI-TEST-001",
        confirmed: true,
      },
    ],
  };
  const paid = command("checkout", payload, owner, paymentKey);
  assert.equal(paid.status, "paid");
  assert.ok(paid.invoice);
  assert.equal(
    command("checkout", payload, owner, paymentKey).invoice,
    paid.invoice,
  );
  assert.deepEqual(snapshot(owner).ingredients, after.ingredients);
  assert.throws(
    () =>
      command(
        "checkout",
        { ...payload, payments: [{ method: "cash", amount: 1 }] },
        owner,
        paymentKey,
      ),
    /reused/,
  );
  assert.equal(
    snapshot(owner).customers.find((c) => c.name === "Ananya")!.points,
    9,
  );
});
test("payment mismatch and unverified UPI roll back all side effects", () => {
  const o = command("saveOrder", draft());
  const stock = snapshot(owner).ingredients;
  assert.throws(
    () =>
      command("checkout", {
        id: o.id,
        version: o.version,
        payments: [{ method: "upi", amount: o.total }],
      }),
    /Confirm/,
  );
  assert.throws(
    () =>
      command("checkout", {
        id: o.id,
        version: o.version,
        payments: [{ method: "cash", amount: 10 }],
      }),
    /exactly/,
  );
  assert.deepEqual(snapshot(owner).ingredients, stock);
  assert.equal(
    snapshot(owner).orders.find((x) => x.id === o.id)!.status,
    "open",
  );
});
test("server rejects unauthorized discount, stock edit, refund and barista order entry", () => {
  assert.throws(
    () => command("saveOrder", { ...draft(), discountBps: 1000 }, cashier),
    /role/,
  );
  assert.throws(
    () =>
      command(
        "adjustStock",
        { id: "milk", amount: 100, kind: "Purchase", reason: "test" },
        cashier,
      ),
    /role/,
  );
  assert.throws(() => command("saveOrder", draft(), barista), /role/);
  const o = command("saveOrder", draft());
  const p = command("checkout", {
    id: o.id,
    version: o.version,
    payments: [{ method: "cash", amount: o.total }],
  });
  assert.throws(
    () =>
      command(
        "refund",
        {
          id: p.id,
          version: p.version,
          reason: "test refund",
          confirmed: true,
        },
        cashier,
      ),
    /role/,
  );
});
test("held orders persist, table conflicts and stale versions reject rather than overwrite", () => {
  const a = command("saveOrder", { ...draft(), mode: "Dine-in", tableNo: 3 });
  assert.equal(
    snapshot(owner).orders.find((o) => o.id === a.id)!.lines.length,
    3,
  );
  assert.throws(
    () => command("saveOrder", { ...draft(), mode: "Dine-in", tableNo: 3 }),
    /table already/,
  );
  assert.throws(() => command("saveOrder", { ...a, version: 0 }), /changed/);
  assert.equal(snapshot(owner).orders.find((o) => o.id === a.id)!.version, 1);
});
test("incremental KOTs only consume new quantities; sent item removal is blocked", () => {
  const a = command("saveOrder", draft());
  const sent = command("sendKitchen", { id: a.id, version: a.version });
  assert.throws(
    () => command("saveOrder", { ...sent, lines: sent.lines.slice(1) }),
    /cannot be removed/,
  );
  const b = command("saveOrder", {
    ...sent,
    lines: sent.lines.map((l: (typeof sent.lines)[number], i: number) =>
      i === 2 ? { ...l, qty: l.qty + 1 } : l,
    ),
  });
  const before = snapshot(owner);
  command("sendKitchen", { id: b.id, version: b.version });
  const after = snapshot(owner);
  assert.equal(after.tickets.length, before.tickets.length + 1);
  assert.equal(
    after.ingredients.find((i) => i.id === "brownie")!.stock,
    before.ingredients.find((i) => i.id === "brownie")!.stock - 1,
  );
  assert.equal(
    after.ingredients.find((i) => i.id === "oat")!.stock,
    before.ingredients.find((i) => i.id === "oat")!.stock,
  );
});
test("insufficient stock rolls back every ingredient and ticket change", () => {
  const before = snapshot(owner);
  const a = command("saveOrder", {
    ...draft(),
    lines: [
      {
        id: crypto.randomUUID(),
        productId: "toast",
        qty: 99,
        size: "Regular",
        addons: [],
        note: "",
      },
    ],
  });
  assert.throws(
    () => command("sendKitchen", { id: a.id, version: a.version }),
    /Not enough/,
  );
  assert.deepEqual(snapshot(owner).ingredients, before.ingredients);
  assert.equal(snapshot(owner).tickets.length, before.tickets.length);
});
test("ticket transitions are ordered; barista snapshot omits financial data", () => {
  const t = snapshot(owner).tickets.find((t) => t.status === "New")!;
  command("ticketStatus", { id: t.id, status: "Preparing" }, barista);
  assert.throws(
    () => command("ticketStatus", { id: t.id, status: "Served" }, barista),
    /changed/,
  );
  command("ticketStatus", { id: t.id, status: "Ready" }, barista);
  assert.equal(snapshot(barista).orders.length, 0);
  assert.equal(snapshot(barista).audit.length, 0);
  assert.equal(snapshot(barista).ingredients.length, 0);
});
test("refund requires external confirmation, preserves consumed stock, and is replay safe", () => {
  const a = command("saveOrder", draft());
  const p = command("checkout", {
    id: a.id,
    version: a.version,
    payments: [{ method: "cash", amount: a.total }],
  });
  const before = snapshot(owner).ingredients;
  assert.throws(
    () =>
      command("refund", {
        id: p.id,
        version: p.version,
        reason: "Customer request",
      }),
    /Confirm/,
  );
  const key = crypto.randomUUID();
  const input = {
    id: p.id,
    version: p.version,
    reason: "Customer request",
    confirmed: true,
  };
  const r = command("refund", input, owner, key);
  assert.equal(r.refund, p.total);
  assert.equal(command("refund", input, owner, key).refund, p.total);
  assert.deepEqual(snapshot(owner).ingredients, before);
});
test("session tokens authenticate, wrong passwords reject, and requests need session cookies", () => {
  assert.throws(() => login("owner", "wrong-password"), /incorrect/);
  const { token } = login("owner", "test-password-123");
  assert.equal(
    authenticate(
      new Request("http://localhost", {
        headers: { cookie: `cafeos_session=${token}` },
      }),
    ).role,
    "owner",
  );
  assert.throws(() => authenticate(new Request("http://localhost")), /sign in/);
});
test("previously prepared items can settle after a menu item becomes unavailable", () => {
  const d = draft();
  d.lines = [
    {
      id: crypto.randomUUID(),
      productId: "americano",
      qty: 1,
      size: "Regular",
      addons: [],
      note: "",
    },
  ];
  const a = command("saveOrder", d);
  const sent = command("sendKitchen", { id: a.id, version: a.version });
  const product = snapshot(owner).products.find((p) => p.id === "americano")!;
  command("saveProduct", { ...product, available: false });
  const saved = command("saveOrder", sent);
  assert.throws(
    () =>
      command("saveOrder", {
        ...saved,
        lines: saved.lines.map((l: (typeof saved.lines)[number]) => ({
          ...l,
          qty: 2,
        })),
      }),
    /additional quantities/,
  );
  const paid = command("checkout", {
    id: saved.id,
    version: saved.version,
    payments: [{ method: "cash", amount: saved.total }],
  });
  assert.equal(paid.status, "paid");
  command("saveProduct", product);
});
test("pizza, chai, samosa and pizza combo route and deduct their configured recipes", () => {
  const before = snapshot(owner);
  const d = draft();
  d.customer = "New menu demo";
  d.lines = ["pizza", "chai", "samosa", "pizza-combo"].map((id) => ({
    id: crypto.randomUUID(),
    productId: id,
    qty: 1,
    size: "Regular",
    addons: [],
    note: "",
  }));
  const o = command("saveOrder", d);
  assert.equal(o.total, 90090);
  const sent = command("sendKitchen", { id: o.id, version: o.version });
  const after = snapshot(owner);
  assert.equal(
    after.ingredients.find((i) => i.id === "pizzaDough")!.stock,
    before.ingredients.find((i) => i.id === "pizzaDough")!.stock - 2,
  );
  assert.equal(
    after.ingredients.find((i) => i.id === "samosa")!.stock,
    before.ingredients.find((i) => i.id === "samosa")!.stock - 2,
  );
  const tickets = after.tickets.filter((t) => t.orderId === o.id);
  assert.deepEqual(tickets.map((t) => t.station).sort(), [
    "Barista",
    "Kitchen",
  ]);
  const paid = command("checkout", {
    id: sent.id,
    version: sent.version,
    payments: [{ method: "cash", amount: sent.total }],
  });
  assert.equal(paid.status, "paid");
  assert.deepEqual(snapshot(owner).ingredients, after.ingredients);
});
test("only the owner can publish a team theme and ordinary settings edits retain it", () => {
  const previous = snapshot(owner).settings;
  for (const user of [cashier, barista])
    assert.throws(
      () => command("setTheme", { theme: "neon-lime" }, user),
      /role/,
    );
  assert.throws(
    () =>
      execute(
        { id: "manager", name: "Manager", role: "manager" },
        {
          operationId: crypto.randomUUID(),
          action: "setTheme",
          payload: { theme: "cyber-blue" },
        },
      ),
    /role/,
  );
  assert.throws(() => command("setTheme", { theme: "unknown-palette" }));
  const key = crypto.randomUUID();
  command("setTheme", { theme: "cyber-blue" }, owner, key);
  assert.equal(snapshot(cashier).settings.theme, "cyber-blue");
  assert.equal(
    command("setTheme", { theme: "cyber-blue" }, owner, key).theme,
    "cyber-blue",
  );
  command("settings", {
    outlet: previous.outlet,
    taxLabel: previous.taxLabel,
    loyaltyEvery: previous.loyaltyEvery,
  });
  assert.equal(snapshot(owner).settings.theme, "cyber-blue");
  assert.ok(
    snapshot(owner).audit.some(
      (a) => a.action === "theme.changed" && a.detail.includes("cyber-blue"),
    ),
  );
  command("setTheme", { theme: "neon-lime" });
  assert.equal(snapshot(barista).settings.theme, "neon-lime");
  command("setTheme", { theme: previous.theme || "garden" });
});
test("team notices carry trusted author roles, reach staff, and reject unauthorized edits", () => {
  const manager = {
    id: "manager",
    name: "Shift manager",
    role: "manager",
  } as const;
  const post = (action: string, payload: unknown) =>
    execute(manager, { operationId: crypto.randomUUID(), action, payload });
  const input = {
    version: 0,
    message: "Check the oven before opening",
    priority: "important",
    expiresOn: null,
    author: { name: "Fake owner", role: "owner" },
  };
  const note = post("saveNotice", input);
  assert.equal(note.author.role, "manager");
  assert.equal(note.author.name, "Shift manager");
  assert.equal(snapshot(barista).notices[0].id, note.id);
  assert.throws(() => command("saveNotice", input, cashier), /role/);
  assert.throws(
    () =>
      command("saveNotice", { ...input, id: note.id, version: note.version }),
    /own/,
  );
  const updated = post("saveNotice", {
    ...input,
    id: note.id,
    version: note.version,
    message: "Oven checked",
  });
  assert.throws(
    () => post("saveNotice", { ...input, id: note.id, version: note.version }),
    /changed/,
  );
  const own = command("saveNotice", {
    ...input,
    message: "Have a lovely shift",
    priority: "normal",
  });
  assert.equal(own.author.role, "owner");
  assert.throws(
    () => post("archiveNotice", { id: own.id, version: own.version }),
    /own/,
  );
  command("archiveNotice", { id: updated.id, version: updated.version });
  assert.ok(!snapshot(barista).notices.some((n) => n.id === note.id));
  command("archiveNotice", { id: own.id, version: own.version });
  assert.throws(
    () => command("saveNotice", { ...input, expiresOn: "2020-01-01" }),
    /expiry/,
  );
});
test("offer uploads enforce ownership, image validation, scheduling, versioning and safe snapshots", async () => {
  const { indiaDay } = await import("../lib/types");
  const { offerRecord } = await import("../lib/communications");
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM0kAAAAASUVORK5CYII=";
  const input = {
    version: 0,
    title: "Today’s combo",
    startsOn: indiaDay(),
    endsOn: indiaDay(),
    image,
  };
  assert.throws(() => command("saveOffer", input, cashier), /role/);
  assert.throws(
    () =>
      command("saveOffer", {
        ...input,
        image: "data:image/png;base64,SGVsbG8=",
      }),
    /content/,
  );
  const key = crypto.randomUUID();
  const offer = command("saveOffer", input, owner, key);
  assert.equal(command("saveOffer", input, owner, key).version, offer.version);
  assert.equal(snapshot(cashier).offer?.title, input.title);
  assert.equal(snapshot(cashier).offerEditor, null);
  assert.ok(!JSON.stringify(snapshot(owner)).includes(image));
  assert.throws(() => command("saveOffer", input), /changed/);
  const scheduled = command("saveOffer", {
    ...input,
    version: offer.version,
    startsOn: "2099-01-01",
    endsOn: "2099-01-02",
  });
  assert.equal(snapshot(cashier).offer, null);
  assert.equal(snapshot(owner).offerEditor?.version, scheduled.version);
  command("hideOffer", { version: scheduled.version });
  assert.equal(snapshot(owner).offerEditor?.active, false);
  assert.equal(offerRecord()?.image, image);
});
test("cash tender records change without inflating revenue and rejects short cash", () => {
  const o = command("saveOrder", draft());
  const p = {
    id: o.id,
    version: o.version,
    payments: [{ method: "cash", amount: o.total, tendered: o.total - 1 }],
  };
  assert.throws(() => command("checkout", p), /cover/);
  assert.equal(
    snapshot(owner).orders.find((x) => x.id === o.id)!.status,
    "open",
  );
  const key = crypto.randomUUID();
  p.payments[0].tendered = o.total + 5000;
  const paid = command("checkout", p, owner, key);
  assert.equal(paid.payments[0].change, 5000);
  assert.equal(paid.payments[0].amount, o.total);
  assert.equal(command("checkout", p, owner, key).payments[0].change, 5000);
});
test("optional customer contacts persist with explicit consent and phone identity", () => {
  const o = command("saveOrder", draft());
  const contact = {
    phone: "+91 9876543210",
    email: "customer@example.com",
    marketingConsent: true,
  };
  const p = {
    id: o.id,
    version: o.version,
    contact,
    payments: [{ method: "cash", amount: o.total }],
  };
  assert.throws(() =>
    command("checkout", { ...p, contact: { ...contact, email: "broken" } }),
  );
  assert.throws(
    () =>
      command("checkout", {
        ...p,
        contact: { phone: "", email: "", marketingConsent: true },
      }),
    /phone|email/,
  );
  const paid = command("checkout", p);
  const customer = snapshot(owner).customers.find(
    (c) => c.phone === contact.phone,
  )!;
  assert.ok(customer);
  assert.equal(customer.marketingConsent, true);
  assert.ok(customer.consentAt);
  assert.equal(paid.customerId, customer.id);
  command("refund", {
    id: paid.id,
    version: paid.version,
    confirmed: true,
    reason: "Customer contact test",
  });
  assert.equal(
    snapshot(owner).customers.find((c) => c.id === customer.id)!.points,
    0,
  );
});
test("payment QR setup is owner-only, versioned, and excludes image bytes from snapshots", () => {
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM0kAAAAASUVORK5CYII=";
  const p = { version: 0, label: "Cafe merchant", upiId: "cafe@bank", image };
  assert.throws(() => command("savePaymentQR", p, cashier), /role/);
  assert.throws(() => command("savePaymentQR", { ...p, upiId: "invalid" }));
  const q = command("savePaymentQR", p);
  assert.equal(snapshot(cashier).paymentQR?.label, "Cafe merchant");
  assert.ok(!JSON.stringify(snapshot(cashier).paymentQR).includes(image));
  assert.throws(() => command("savePaymentQR", p), /changed/);
  assert.equal(q.version, 1);
});
test("reports enforce roles, escape CSV formulas and produce native XLSX ZIP files", async () => {
  const { reportFor, reportCSV, reportXLSX } = await import("../lib/reports");
  assert.throws(() => reportFor(cashier, "inventory"), /role/);
  assert.throws(() => reportFor(barista, "orders"), /role/);
  const report = reportFor(owner, "inventory");
  assert.equal(report.rows.length, snapshot(owner).ingredients.length);
  const fixture = {
    ...report,
    headers: ["Name", "Value"],
    rows: [
      ["=SUM(1,2)", 42],
      ["Tea, chai", 2.5],
    ],
  };
  const csv = reportCSV(fixture);
  assert.ok(csv.includes("'=SUM"));
  assert.ok(csv.includes('"Tea, chai"'));
  const xlsx = reportXLSX(fixture);
  assert.equal(xlsx.readUInt32LE(0), 0x04034b50);
  assert.ok(xlsx.includes(Buffer.from('t="inlineStr"')));
  assert.ok(!xlsx.includes(Buffer.from("<f>")));
});
after(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
});

test("kitchen estimates validate minutes and cancellation records a reason across stations", () => {
  const o = command("saveOrder", draft());
  command("sendKitchen", { id: o.id, version: o.version });
  const t = snapshot(owner).tickets.find(t => t.orderId === o.id)!;
  assert.throws(() => command("ticketEstimate", { id: t.id, minutes: 0 }, barista));
  assert.throws(() => command("ticketEstimate", { id: t.id, minutes: 15 }, cashier));
  const estimate = command("ticketEstimate", { id: t.id, minutes: 20 }, barista);
  assert.equal(estimate.estimatedMinutes, 20);
  assert.ok(Date.parse(estimate.readyAt) > Date.now() + 19 * 60000);
  assert.throws(() => command("kitchenCancelOrder", { id: t.id, reason: " " }, barista));
  const stock = snapshot(owner).ingredients;
  command("kitchenCancelOrder", { id: t.id, reason: "Ingredients unavailable" }, barista);
  assert.equal(snapshot(owner).orders.find(x => x.id === o.id)!.status, "cancelled");
  for (const ticket of snapshot(owner).tickets.filter(x => x.orderId === o.id)) {
    assert.equal(ticket.status, "Cancelled");
    assert.equal(ticket.cancellationReason, "Ingredients unavailable");
  }
  assert.deepEqual(snapshot(owner).ingredients, stock);
  assert.throws(() => command("ticketEstimate", { id: t.id, minutes: 10 }, barista));
  assert.throws(() => command("ticketStatus", { id: t.id, status: "Preparing" }, barista));
});

test("kitchen cancellation preserves paid bills and payments", () => {
  const o = command("saveOrder", draft());
  const paid = command("checkout", { id: o.id, version: o.version, payments: [{ method: "cash", amount: o.total }] });
  const t = snapshot(owner).tickets.find(t => t.orderId === o.id)!;
  command("kitchenCancelOrder", { id: t.id, reason: "Equipment failure" }, barista);
  assert.deepEqual(snapshot(owner).orders.find(x => x.id === o.id), paid);
});

test("item acceptance, timing and cancellation preserve the other items and the bill", () => {
  const o = command("saveOrder", draft());
  command("sendKitchen", { id: o.id, version: o.version });
  const t = snapshot(owner).tickets.find(t => t.orderId === o.id && t.lines.length > 1)!;
  const before = snapshot(owner).orders.find(x => x.id === o.id)!;
  assert.throws(() => command("ticketItem", { id: t.id, index: 0, kind: "accept" }, cashier));
  command("ticketItem", { id: t.id, index: 0, kind: "accept" }, barista);
  let updated = snapshot(owner).tickets.find(x => x.id === t.id)!;
  assert.equal(updated.lines[0].status, "Preparing");
  assert.equal(updated.lines[1].status, "New");
  assert.throws(() => command("ticketStatus", { id: t.id, status: "Ready" }, barista));
  command("ticketItem", { id: t.id, index: 0, kind: "estimate", minutes: 7 }, barista);
  assert.throws(() => command("ticketItem", { id: t.id, index: 0, kind: "cancel", reason: " " }, barista));
  command("ticketItem", { id: t.id, index: 0, kind: "cancel", reason: "Unavailable" }, barista);
  updated = snapshot(owner).tickets.find(x => x.id === t.id)!;
  assert.equal(updated.lines[0].cancellationReason, "Unavailable");
  assert.equal(updated.lines[0].estimatedMinutes, 7);
  assert.equal(updated.lines[1].status, "New");
  assert.deepEqual(snapshot(owner).orders.find(x => x.id === o.id), before);
  assert.throws(() => command("ticketItem", { id: t.id, index: 0, kind: "accept" }, barista));
  command("ticketItem", { id: t.id, index: 1, kind: "accept" }, barista);
  command("ticketItem", { id: t.id, index: 1, kind: "ready" }, barista);
  assert.equal(snapshot(owner).tickets.find(x => x.id === t.id)!.status, "Ready");
});

test("counter priority persists into kitchen tickets and changes after dispatch", () => {
  const input = draft();
  const o = command("saveOrder", { ...input, lines: input.lines.map((l, i) => ({ ...l, priority: i === 0 ? "first" : "later" })) }, cashier);
  command("sendKitchen", { id: o.id, version: o.version }, cashier);
  const t = snapshot(owner).tickets.find(t => t.orderId === o.id)!;
  const expected = o.lines.find((l: { id: string }) => l.id === t.lines[0].lineId)!.priority;
  assert.equal(t.lines[0].priority, expected);
  assert.throws(() => command("ticketItemPriority", { id: t.id, index: 0, priority: "first" }, barista));
  command("ticketItemPriority", { id: t.id, index: 0, priority: "normal" }, cashier);
  const saved = snapshot(owner).orders.find(x => x.id === o.id)!;
  assert.equal(saved.lines.find(l => l.id === t.lines[0].lineId)!.priority, "normal");
  command("saveOrder", { ...saved, lines: saved.lines.map(l => ({ ...l, priority: "first" })) }, cashier);
  assert.equal(snapshot(owner).tickets.find(x => x.id === t.id)!.lines[0].priority, "first");
});
