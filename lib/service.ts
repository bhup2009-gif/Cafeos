import { pantrySnapshot, pantryCommand, pantryCashOutflow, recordStockChange } from "./pantry";
import {
  contactInput,
  paymentQRView,
  savePaymentQR,
  cashPart,
} from "./billing";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { all, get, put, putOrder, db, transaction } from "./db";
import { DomainError, permit, hash, changePassword } from "./auth";
import { totals } from "./money";
import { themeIds } from "./themes";
import { subscriptionSnapshot } from "./subscription";
import {
  visibleOffer,
  offerForEditor,
  teamNotices,
  saveOffer,
  hideOffer,
  saveNotice,
  archiveNotice,
} from "./communications";
import { menuRank, isMenuImage } from "./menu-assets";
import {
  indiaDay,
  orderServiceLabel,
  type AppData,
  type Order,
  type Product,
  type Line,
  type Ticket,
  type Ingredient,
  type User,
  type Payment,
} from "./types";
const text = z.string().max(300);
const lineInput = z.object({
  id: z.string().min(1).max(100),
  productId: z.string(),
  qty: z.number().int().min(1).max(99),
  size: z.string().max(50).default("Regular"),
  addons: z.array(z.string().max(50)).max(10).default([]),
  note: text.default(""),
  priority: z.enum(["first", "normal", "later"]).default("normal"),
});
const orderInput = z.object({
  id: z.string().min(1).max(100),
  version: z.number().int().min(0),
  mode: z.enum(["Dine-in", "Takeaway", "Delivery pickup", "Online delivery"]),
  deliveryServiceId: z.string().max(100).optional(),
  deliveryServiceName: z.string().max(80).optional(),
  tableNo: z.number().int().min(1).max(12).nullable(),
  customer: text.default(""),
  contact: contactInput.optional(),
  discountBps: z.number().int().min(0).max(5000).default(0),
  lines: z.array(lineInput).min(1).max(100),
});
const paymentInput = z.object({
  method: z.enum(["cash", "upi", "card"]),
  amount: z.number().int().positive().max(100000000),
  reference: z.string().max(100).optional(),
  confirmed: z.boolean().optional(),
  tendered: z.number().int().min(0).max(100000000).optional(),
});
function audit(user: User, action: string, detail: string) {
  const id = randomUUID();
  put("audit", id, {
    id,
    actor: user.name,
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
}
function order(id: string) {
  const o = get<Order>("orders", id);
  if (!o) throw new DomainError("Order not found", 404);
  return o;
}
function active(o: Order) {
  if (o.status !== "open")
    throw new DomainError("This order is already closed", 409);
}
function version(o: Order, v: unknown) {
  if (o.version !== v)
    throw new DomainError(
      "Order changed on another screen. Reload its latest version before continuing.",
      409,
    );
}
const staff = ["owner", "manager", "cashier"] as const;
export function deliveryServices(): AppData["deliveryServices"] {
  return get<AppData["deliveryServices"]>("metadata", "delivery-services") ?? {version: 0, services: ["Zomato", "Ola", "Swiggy"].map(name => ({id: name.toLowerCase(), name, active: true}))};
}
export function snapshot(user: User): AppData {
  const privileged = ["owner", "manager"].includes(user.role);
  return {
    deliveryServices: deliveryServices(),
    pantry: pantrySnapshot(user),
    subscription: subscriptionSnapshot(),
    user,
    offer: visibleOffer(),
    offerEditor: offerForEditor(user),
    notices: teamNotices(),
    paymentQR: paymentQRView(),
    products: all<Product>("products").sort(
      (a, b) => menuRank(a.id) - menuRank(b.id),
    ),
    orders:
      user.role === "barista"
        ? []
        : all<Order>("orders").sort((a, b) => b.number - a.number),
    tickets: all<Ticket>("tickets").map(t => { const o = get<Order>("orders", t.orderId); return {...t, customer: o?.customer ?? t.customer, serviceLabel: o ? orderServiceLabel(o) : t.serviceLabel}; }),
    ingredients: privileged ? all<Ingredient>("ingredients") : [],
    customers: user.role === "barista" ? [] : all("customers"),
    audit: privileged
      ? all<AppData["audit"][number]>("audit").reverse().slice(0, 100)
      : [],
    closings: privileged ? all("closings") : [],
    settings: get("metadata", "settings")!,
  };
}
function buildLine(raw: z.infer<typeof lineInput>, previous?: Line): Line {
  const p = get<Product>("products", raw.productId);
  if (previous && previous.sentQty > 0) {
    if (
      raw.productId !== previous.productId ||
      raw.size !== previous.size ||
      JSON.stringify(raw.addons) !== JSON.stringify(previous.addons) ||
      raw.note !== previous.note ||
      raw.qty < previous.sentQty
    )
      throw new DomainError(
        "Sent items are locked. Add a new line for changes or ask a manager to cancel.",
      );
    if ((!p || !p.available) && raw.qty > previous.sentQty)
      throw new DomainError(
        "An item is no longer available for additional quantities",
      );
    return { ...previous, qty: raw.qty, priority: raw.priority };
  }
  if (!p || !p.available)
    throw new DomainError("An item is no longer available");
  if (Object.keys(p.variants).length && !Object.hasOwn(p.variants, raw.size))
    throw new DomainError("Choose a valid size");
  if (
    new Set(raw.addons).size !== raw.addons.length ||
    raw.addons.some((a) => !Object.hasOwn(p.addons, a))
  )
    throw new DomainError("Choose valid add-ons");
  const multiplier = raw.size === "Large" ? 1.5 : 1;
  const recipe = Object.fromEntries(
    Object.entries(p.recipe).map(([k, v]) => [k, v * multiplier]),
  );
  if (raw.addons.includes("Oat milk") && recipe.milk) {
    recipe.oat = recipe.milk;
    delete recipe.milk;
  }
  if (raw.addons.includes("Extra shot"))
    recipe.beans = (recipe.beans || 0) + 18;
  if (raw.addons.includes("Extra cheese"))
    recipe.cheese = (recipe.cheese || 0) + 30;
  const price =
    p.price +
    (p.variants[raw.size] || 0) +
    raw.addons.reduce((s, a) => s + p.addons[a], 0);
  return {
    ...raw,
    name: p.name,
    price,
    taxBps: p.taxBps,
    recipe,
    station: p.station,
    sentQty: 0,
  };
}
function saveOrder(user: User, payload: unknown) {
  permit(user, [...staff]);
  const input = orderInput.parse(payload);
  const old = get<Order>("orders", input.id);
  if (input.mode === "Online delivery") {
    const service = deliveryServices().services.find(s => s.id === input.deliveryServiceId);
    const retained = old?.mode === "Online delivery" && old.deliveryServiceId === input.deliveryServiceId;
    if (!service || (!service.active && !retained)) throw new DomainError("Choose an available delivery service");
    input.deliveryServiceName = retained ? old.deliveryServiceName || service.name : service.name;
  } else {
    input.deliveryServiceId = undefined;
    input.deliveryServiceName = undefined;
  }
  if (new Set(input.lines.map((l) => l.id)).size !== input.lines.length)
    throw new DomainError("Duplicate item identifier");
  if (old) {
    active(old);
    version(old, input.version);
  } else if (input.version !== 0)
    throw new DomainError("Order no longer exists", 409);
  if (input.discountBps !== (old?.discountBps || 0))
    permit(user, ["owner", "manager"]);
  if (input.mode === "Dine-in" && !input.tableNo)
    throw new DomainError("Choose a table");
  if (input.mode !== "Dine-in" && input.tableNo)
    throw new DomainError("Only dine-in orders use tables");
  if (
    input.tableNo &&
    all<Order>("orders").some(
      (o) =>
        o.id !== input.id && o.status === "open" && o.tableNo === input.tableNo,
    )
  )
    throw new DomainError(
      "That table already has an order. Open it from Tables.",
      409,
    );
  if (
    old?.lines.some(
      (l) => l.sentQty > 0 && !input.lines.some((n) => n.id === l.id),
    )
  )
    throw new DomainError("Sent items cannot be removed");
  const lines = input.lines.map((l) =>
    buildLine(
      l,
      old?.lines.find((x) => x.id === l.id),
    ),
  );
  const next: Order = {
    ...input,
    number:
      old?.number ||
      Number(
        (
          db
            .prepare("SELECT COALESCE(MAX(number),100) AS n FROM orders")
            .get() as { n: number }
        ).n,
      ) + 1,
    status: "open",
    version: (old?.version || 0) + 1,
    lines,
    createdAt: old?.createdAt || new Date().toISOString(),
    paidAt: null,
    invoice: null,
    payments: [],
    refund: 0,
    loyaltyEarned: 0,
    ...totals(lines, input.discountBps),
  };
  putOrder(next);
  for (const ticket of all<Ticket>("tickets").filter(t => t.orderId === next.id && !["Served", "Cancelled"].includes(t.status))) {
    for (const item of ticket.lines) {
      const matches = next.lines.filter(l => l.name === item.name && l.size === item.size && l.note === item.note && JSON.stringify(l.addons) === JSON.stringify(item.addons));
      const line = next.lines.find(l => l.id === item.lineId) ?? (matches.length === 1 ? matches[0] : undefined);
      if (line) { item.lineId = line.id; item.priority = line.priority ?? "normal"; }
    }
    put("tickets", ticket.id, ticket);
  }
  audit(user, "order.saved", `Order #${next.number}`);
  return next;
}
function sendKitchen(o: Order, user: User) {
  const groups: Record<string, Ticket["lines"]> = {};
  const usage: Record<string, number> = {};
  for (const line of o.lines) {
    const qty = line.qty - line.sentQty;
    if (qty <= 0) continue;
    for (const [ingredient, amount] of Object.entries(line.recipe))
      usage[ingredient] = (usage[ingredient] || 0) + amount * qty;
    const stations =
      line.station === "Both" ? ["Barista", "Kitchen"] : [line.station];
    for (const station of stations)
      (groups[station] ??= []).push({
        lineId: line.id,
        priority: line.priority ?? "normal",
        status: "New",
        name: line.name,
        qty,
        size: line.size,
        addons: line.addons,
        note: line.note,
      });
    line.sentQty = line.qty;
  }
  if (!Object.keys(groups).length) return;
  for (const [id, amount] of Object.entries(usage)) {
    const i = get<Ingredient>("ingredients", id);
    if (!i) throw new DomainError("Recipe ingredient missing");
    if (i.stock < amount)
      throw new DomainError(
        `Not enough ${i.name}. Receive stock or adjust the recipe.`,
      );
    i.stock = Math.round((i.stock - amount) * 1000) / 1000;
    put("ingredients", id, i);
  }
  for (const [station, lines] of Object.entries(groups)) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const t: Ticket = {
      id,
      orderId: o.id,
      orderNumber: o.number,
      station,
      status: "New",
      lines,
      createdAt: now,
      updatedAt: now,
    };
    db.prepare("INSERT INTO tickets VALUES(?,?,?)").run(
      id,
      o.id,
      JSON.stringify(t),
    );
  }
  audit(user, "kitchen.sent", `Order #${o.number}; recipe stock consumed once`);
}
export function execute(user: User, body: unknown) {
  const envelope = z
    .object({
      operationId: z.string().min(8).max(120),
      action: z.string(),
      payload: z.record(z.string(), z.unknown()),
    })
    .parse(body);
  return transaction(() => {
    const fingerprint = hash(
      JSON.stringify({ action: envelope.action, payload: envelope.payload }),
    );
    const previous = db
      .prepare("SELECT * FROM operations WHERE id=?")
      .get(envelope.operationId) as
      { actor: string; fingerprint: string; response: string } | undefined;
    if (previous) {
      if (previous.actor !== user.id || previous.fingerprint !== fingerprint)
        throw new DomainError(
          "Operation ID was reused with different data",
          409,
        );
      return JSON.parse(previous.response);
    }
    const p = envelope.payload as Record<string, unknown>;
    let result: unknown;
    switch (envelope.action) {
      case "deliveryService": {
        permit(user, ["owner", "manager"]);
        const input = z.object({version:z.number().int(), name:z.string().trim().min(1).max(80).optional(), removeId:z.string().optional()}).parse(p);
        const config = deliveryServices();
        if (input.version !== config.version) throw new DomainError("Delivery services changed. Reload and try again.",409);
        if (input.removeId) {
          const service = config.services.find(s => s.id === input.removeId && s.active);
          if (!service) throw new DomainError("Delivery service not found");
          service.active = false;
          audit(user,"delivery.removed",service.name);
        } else {
          if (!input.name) throw new DomainError("Enter a delivery service name");
          if (config.services.some(s => s.active && s.name.toLowerCase() === input.name!.toLowerCase())) throw new DomainError("Delivery service already exists");
          config.services.push({id:randomUUID(),name:input.name,active:true});
          audit(user,"delivery.added",input.name);
        }
        config.version++;
        put("metadata","delivery-services",config);
        result = config;
        break;
      }
      case "pantryCASettings":
      case "salaryProfile":
      case "salaryAccrue":
      case "pantrySupplier":
      case "pantryPurchase":
      case "pantryExpenses":
      case "pantryPayment":
        result = pantryCommand(user, envelope.action, p);
        break;
      case "saveOrder":
        result = saveOrder(user, p);
        break;
      case "sendKitchen": {
        permit(user, [...staff]);
        const o = order(z.string().parse(p.id));
        active(o);
        version(o, p.version);
        sendKitchen(o, user);
        o.version++;
        putOrder(o);
        result = o;
        break;
      }
      case "checkout": {
        permit(user, [...staff]);
        const o = order(z.string().parse(p.id));
        active(o);
        version(o, p.version);
        if (p.contact !== undefined) o.contact = contactInput.parse(p.contact);
        if (p.customer !== undefined) o.customer = text.parse(p.customer);
        const payments = z
          .array(paymentInput)
          .min(1)
          .max(10)
          .parse(p.payments)
          .map((x) =>
            x.method === "cash"
              ? { ...x, ...cashPart(x.amount, x.tendered) }
              : x,
          );
        if (
          payments.some(
            (x) =>
              x.method !== "cash" && (!x.confirmed || !x.reference?.trim()),
          )
        )
          throw new DomainError(
            "Confirm the external payment and enter its receipt/reference. CaféOS does not verify it electronically.",
          );
        if (payments.reduce((s, x) => s + x.amount, 0) !== o.total)
          throw new DomainError("Payments must equal the bill total exactly");
        sendKitchen(o, user);
        o.status = "paid";
        o.payments = payments as Payment[];
        o.paidAt = new Date().toISOString();
        o.version++;
        o.invoice = `COS-${indiaDay().replaceAll("-", "")}-${o.number}`;
        if (o.customer.trim() || o.contact?.phone || o.contact?.email) {
          const id = o.contact?.phone
            ? `phone:${o.contact.phone.replace(/[^+0-9]/g, "")}`
            : o.contact?.email
              ? `email:${o.contact.email.toLowerCase()}`
              : o.customer.trim().toLocaleLowerCase();
          o.customerId = id;
          const c = get<AppData["customers"][number]>("customers", id) || {
            id,
            name: o.customer.trim() || "Guest",
            points: 0,
            visits: 0,
          };
          if (o.customer.trim()) c.name = o.customer.trim();
          if (o.contact) {
            c.phone = o.contact.phone || c.phone;
            c.email = o.contact.email || c.email;
            c.marketingConsent = o.contact.marketingConsent;
            c.consentAt = o.contact.marketingConsent
              ? new Date().toISOString()
              : null;
          }
          const every = get<AppData["settings"]>(
            "metadata",
            "settings",
          )!.loyaltyEvery;
          o.loyaltyEarned = Math.floor(o.total / every);
          c.points += o.loyaltyEarned;
          c.visits++;
          put("customers", id, c);
        }
        putOrder(o);
        audit(
          user,
          "payment.recorded",
          `${o.invoice}; ${o.total} paise; ${payments.map((x) => x.method).join("+")}`,
        );
        result = o;
        break;
      }
      case "ticketItemPriority": {
        permit(user, ["owner", "manager", "cashier"]);
        const t = get<Ticket>("tickets", z.string().parse(p.id));
        if (!t) throw new DomainError("Ticket not found", 404);
        if (["Served", "Cancelled"].includes(t.status)) throw new DomainError("Ticket is closed", 409);
        const index = z.number().int().min(0).parse(p.index);
        const item = t.lines[index];
        if (!item) throw new DomainError("Item not found", 404);
        const priority = z.enum(["first", "normal", "later"]).parse(p.priority);
        item.priority = priority;
        if (item.lineId) {
          const o = order(t.orderId);
          const line = o.lines.find(l => l.id === item.lineId);
          if (line) {
            line.priority = priority;
            o.version++;
            putOrder(o);
          }
          for (const sibling of all<Ticket>("tickets").filter(x => x.orderId === t.orderId && x.id !== t.id && !["Served", "Cancelled"].includes(x.status))) {
            sibling.lines.forEach(l => { if (l.lineId === item.lineId) l.priority = priority; });
            put("tickets", sibling.id, sibling);
          }
        }
        t.updatedAt = new Date().toISOString();
        put("tickets", t.id, t);
        audit(user, "kitchen.priority", `Order #${t.orderNumber}, ${item.name}: ${priority}`);
        result = t;
        break;
      }
      case "ticketItem": {
        permit(user, ["owner", "manager", "barista"]);
        const t = get<Ticket>("tickets", z.string().parse(p.id));
        if (!t) throw new DomainError("Ticket not found", 404);
        if (["Served", "Cancelled"].includes(t.status)) throw new DomainError("Ticket is closed", 409);
        const index = z.number().int().min(0).parse(p.index);
        const item = t.lines[index];
        if (!item) throw new DomainError("Item not found", 404);
        const current = item.status ?? t.status;
        if (["Served", "Cancelled"].includes(current)) throw new DomainError("Item is closed", 409);
        const action = z.enum(["accept", "estimate", "cancel", "ready", "serve"]).parse(p.kind);
        if (action === "estimate") {
          if (!["New", "Preparing"].includes(current)) throw new DomainError("Item is already ready", 409);
          item.estimatedMinutes = z.number().int().min(1).max(240).parse(p.minutes);
          item.readyAt = new Date(Date.now() + item.estimatedMinutes * 60000).toISOString();
        } else if (action === "cancel") {
          if (current === "Ready") throw new DomainError("Ready items cannot be cancelled here", 409);
          item.cancellationReason = z.string().trim().min(3).max(300).parse(p.reason);
          item.status = "Cancelled";
        } else {
          const next = { accept: "Preparing", ready: "Ready", serve: "Served" }[action];
          const stages = ["New", "Preparing", "Ready", "Served"];
          if (stages.indexOf(next) !== stages.indexOf(current) + 1) throw new DomainError("Item changed. Refresh the kitchen queue.", 409);
          item.status = next;
        }
        const statuses = t.lines.map(l => l.status ?? t.status);
        t.status = statuses.every(s => s === "Cancelled") ? "Cancelled"
          : statuses.every(s => ["Served", "Cancelled"].includes(s)) ? "Served"
          : statuses.every(s => ["Ready", "Served", "Cancelled"].includes(s)) ? "Ready"
          : statuses.some(s => s === "Preparing" || s === "Ready" || s === "Served") ? "Preparing" : "New";
        // Preserve legacy item states before changing the ticket's aggregate status.
        t.lines.forEach((l, i) => { l.status = statuses[i]; });
        t.updatedAt = new Date().toISOString();
        put("tickets", t.id, t);
        audit(user, "kitchen.item", `Order #${t.orderNumber}, ${item.name}: ${action}${item.cancellationReason ? ": " + item.cancellationReason : ""}${action === "cancel" ? ". Preparation only; bill and consumed stock unchanged." : ""}`);
        result = t;
        break;
      }
      case "ticketEstimate": {
        permit(user, ["owner", "manager", "barista"]);
        const t = get<Ticket>("tickets", z.string().parse(p.id));
        if (!t) throw new DomainError("Ticket not found", 404);
        if (!["New", "Preparing"].includes(t.status))
          throw new DomainError("Only waiting or preparing tickets can have an estimate", 409);
        const minutes = z.number().int().min(1).max(240).parse(p.minutes);
        t.estimatedMinutes = minutes;
        t.readyAt = new Date(Date.now() + minutes * 60000).toISOString();
        t.updatedAt = new Date().toISOString();
        put("tickets", t.id, t);
        audit(user, "kitchen.estimate", `Order #${t.orderNumber}, ${t.station}: ${minutes} minutes`);
        result = t;
        break;
      }
      case "kitchenCancelOrder": {
        permit(user, ["owner", "manager", "barista"]);
        const t = get<Ticket>("tickets", z.string().parse(p.id));
        if (!t) throw new DomainError("Ticket not found", 404);
        if (!["New", "Preparing"].includes(t.status))
          throw new DomainError("This ticket can no longer be cancelled", 409);
        const reason = z.string().trim().min(3).max(300).parse(p.reason);
        const o = order(t.orderId);
        if (!["open", "paid"].includes(o.status))
          throw new DomainError("This order is already closed", 409);
        if (o.status === "open") {
          o.status = "cancelled";
          o.version++;
          putOrder(o);
        }
        for (const ticket of all<Ticket>("tickets").filter(x => x.orderId === o.id && !["Served", "Cancelled"].includes(x.status))) {
          ticket.status = "Cancelled";
          ticket.cancellationReason = reason;
          ticket.updatedAt = new Date().toISOString();
          put("tickets", ticket.id, ticket);
        }
        audit(user, "kitchen.cancelled", `Order #${o.number}: ${reason}. Consumed stock retained as usage.${o.status === "paid" ? " Paid bill retained; manager must handle any refund separately." : ""}`);
        result = { orderNumber: o.number, paid: o.status === "paid" };
        break;
      }
      case "ticketStatus": {
        const id = z.string().parse(p.id);
        const t = get<Ticket>("tickets", id);
        if (!t) throw new DomainError("Ticket not found", 404);
        const stages = ["New", "Preparing", "Ready", "Served"];
        const expected = z.string().parse(p.status);
        if (!stages.includes(t.status) || !stages.includes(expected) || stages.indexOf(expected) !== stages.indexOf(t.status) + 1)
          throw new DomainError(
            "Ticket changed. Refresh the kitchen queue.",
            409,
          );
        if (t.lines.some(l => l.status && l.status !== "Cancelled" && l.status !== t.status && l.status !== expected && l.status !== "Served"))
          throw new DomainError("Items have different preparation stages. Update each item separately.", 409);
        for (const item of t.lines) if (item.status !== "Cancelled" && item.status !== "Served") item.status = expected;
        t.status = expected;
        t.updatedAt = new Date().toISOString();
        put("tickets", id, t);
        audit(user, "kitchen.status", `Order #${t.orderNumber}: ${expected}`);
        result = t;
        break;
      }
      case "cancelOrder": {
        permit(user, ["owner", "manager"]);
        const o = order(z.string().parse(p.id));
        active(o);
        version(o, p.version);
        const reason = z.string().trim().min(3).max(300).parse(p.reason);
        o.status = "cancelled";
        o.version++;
        putOrder(o);
        for (const t of all<Ticket>("tickets").filter(
          (t) => t.orderId === o.id && t.status !== "Served",
        )) {
          t.status = "Cancelled";
          put("tickets", t.id, t);
        }
        audit(
          user,
          "order.cancelled",
          `#${o.number}: ${reason}. Consumed stock retained as usage.`,
        );
        result = o;
        break;
      }
      case "refund": {
        permit(user, ["owner", "manager"]);
        const o = order(z.string().parse(p.id));
        version(o, p.version);
        if (o.status !== "paid")
          throw new DomainError("Only a paid bill can be refunded");
        const reason = z.string().trim().min(3).max(300).parse(p.reason);
        if (p.confirmed !== true)
          throw new DomainError(
            "Confirm that the refund was issued externally",
          );
        o.refund = o.total;
        o.status = "refunded";
        o.version++;
        putOrder(o);
        if (o.customerId || o.customer) {
          const id = o.customerId || o.customer.trim().toLocaleLowerCase();
          const c = get<AppData["customers"][number]>("customers", id);
          if (c) {
            c.points = Math.max(0, c.points - o.loyaltyEarned);
            put("customers", id, c);
          }
        }
        audit(
          user,
          "payment.refunded",
          `${o.invoice}: ${reason}; manual full refund; no automatic restock`,
        );
        result = o;
        break;
      }
      case "saveProduct": {
        permit(user, ["owner", "manager"]);
        const product = z
          .object({
            id: z.string().min(1).max(100),
            name: z.string().trim().min(1).max(100),
            category: z.string().trim().min(1).max(50),
            price: z.number().int().min(1).max(10000000),
            station: z.enum(["Barista", "Kitchen", "Both"]),
            available: z.boolean(),
            taxBps: z.number().int().min(0).max(3000),
            variants: z.record(
              z.string(),
              z.number().int().min(0).max(1000000),
            ),
            addons: z.record(z.string(), z.number().int().min(0).max(1000000)),
            recipe: z.record(z.string(), z.number().min(0).max(1000000)),
            image: z.string().max(700000),
            emoji: z.string().max(10),
            description: z.string().max(200),
          })
          .parse(p);
        if (
          product.image &&
          !isMenuImage(product.image) &&
          !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(
            product.image,
          )
        )
          throw new DomainError("Use a PNG, JPEG or WebP image");
        for (const id of Object.keys(product.recipe))
          if (!get("ingredients", id))
            throw new DomainError("Unknown recipe ingredient");
        put("products", product.id, product);
        audit(user, "menu.updated", product.name);
        result = product;
        break;
      }
      case "adjustStock": {
        permit(user, ["owner", "manager"]);
        const input = z
          .object({
            id: z.string(),
            amount: z.number().finite().min(-1000000).max(1000000),
            reason: z.string().trim().min(3).max(200),
            kind: z.enum(["Purchase", "Wastage", "Adjustment"]),
            date:z.string().optional(),
          })
          .parse(p);
        const i = get<Ingredient>("ingredients", input.id);
        if (!i) throw new DomainError("Ingredient missing");
        if (
          (input.kind === "Purchase" && input.amount <= 0) ||
          (input.kind === "Wastage" && input.amount >= 0)
        )
          throw new DomainError("Purchase adds stock; wastage removes it");
        if (i.stock + input.amount < 0)
          throw new DomainError("Stock cannot be negative");
        i.stock = Math.round((i.stock + input.amount) * 1000) / 1000;
        put("ingredients", i.id, i);
        recordStockChange(user,i,input);
        audit(
          user,
          `stock.${input.kind}`,
          `${i.name}: ${input.amount} ${i.unit}. ${input.reason}`,
        );
        result = i;
        break;
      }
      case "closeDay": {
        permit(user, ["owner", "manager"]);
        const input = z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            counted: z.number().int().min(0).max(100000000),
            note: text,
          })
          .parse(p);
        if (input.date !== indiaDay())
          throw new DomainError("Closing is available for today only");
        const sales = all<Order>("orders").filter(
          (o) => o.paidAt && indiaDay(o.paidAt) === input.date,
        );
        const expected = sales.reduce(
          (s, o) =>
            s +
            o.payments
              .filter((p) => p.method === "cash")
              .reduce((a, p) => a + p.amount, 0) -
            (o.refund
              ? o.payments
                  .filter((p) => p.method === "cash")
                  .reduce((a, p) => a + p.amount, 0)
              : 0),
          0,
        ) - pantryCashOutflow(input.date);
        const id = randomUUID();
        const closing = {
          ...input,
          id,
          expected,
          difference: input.counted - expected,
          createdAt: new Date().toISOString(),
        };
        put("closings", id, closing);
        audit(
          user,
          "day.closed",
          `${input.date}: counted ${input.counted}, expected ${expected}; ${input.note}`,
        );
        result = closing;
        break;
      }
      case "savePaymentQR": {
        result = savePaymentQR(user, p);
        audit(user, "payment-qr.saved", "Merchant payment QR updated");
        break;
      }
      case "saveOffer": {
        result = saveOffer(user, p);
        audit(user, "offer.published", "Offer banner published or updated");
        break;
      }
      case "hideOffer": {
        result = hideOffer(user, p);
        audit(user, "offer.hidden", "Offer banner hidden; upload retained");
        break;
      }
      case "saveNotice": {
        result = saveNotice(user, p);
        audit(user, "notice.saved", "Team notice published or updated");
        break;
      }
      case "archiveNotice": {
        result = archiveNotice(user, p);
        audit(user, "notice.archived", "Team notice archived");
        break;
      }
      case "setTheme": {
        permit(user, ["owner"]);
        const { theme } = z.object({ theme: z.enum(themeIds) }).parse(p);
        const settings = {
          ...get<AppData["settings"]>("metadata", "settings")!,
          theme,
        };
        put("metadata", "settings", settings);
        audit(user, "theme.changed", `Team theme: ${theme}`);
        result = settings;
        break;
      }
      case "settings": {
        permit(user, ["owner"]);
        const settings = z
          .object({
            taxLabel: z.string().min(1).max(50),
            loyaltyEvery: z.number().int().min(100).max(1000000),
            outlet: z.string().min(1).max(100),
          })
          .parse(p);
        const merged = {
          ...get<AppData["settings"]>("metadata", "settings")!,
          ...settings,
        };
        put("metadata", "settings", merged);
        audit(user, "settings.updated", "Outlet configuration");
        result = merged;
        break;
      }
      case "password": {
        const input = z
          .object({
            current: z.string().min(1).max(200),
            password: z.string().min(10).max(200),
          })
          .parse(p);
        changePassword(user, input.current, input.password);
        audit(
          user,
          "identity.password",
          "Password changed; all sessions revoked",
        );
        result = { ok: true };
        break;
      }
      default:
        throw new DomainError("Unknown operation");
    }
    db.prepare("INSERT INTO operations VALUES(?,?,?,?)").run(
      envelope.operationId,
      user.id,
      fingerprint,
      JSON.stringify(result),
    );
    return result;
  });
}
