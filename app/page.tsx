"use client";
import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Coffee,
  Eye,
  Palette,
  LayoutGrid,
  UtensilsCrossed,
  ReceiptText,
  Package,
  ChartNoAxesCombined,
  Settings2,
  Search,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  Clock,
  WifiOff,
  LogOut,
  X,
  Trash2,
  Printer,
  Users,
  ShieldCheck,
  Command,
  Pause,
  Send,
  Wallet,
  CheckCircle2,
  Flame,
  Sun,
  RefreshCw,
  MoreHorizontal,
  Leaf,
  Download,
} from "lucide-react";
import {
  money,
  orderServiceLabel,
  indiaDay,
  type AppData,
  type Order,
  type Line,
  type Product,
  type Payment,
} from "@/lib/types";
import { totals } from "@/lib/money";
import { cashOutflowForDay } from "@/lib/pantry-types";
import { prepareOrderSwitch, restoreTableAssignment } from "@/lib/order-switch";
import { localRead, localWrite } from "@/lib/offline";
import CustomerContacts from "./customer-contacts";
import DeliveryServices from "./delivery-services";
import ThemePicker from "./theme-picker";
import InventoryWorkspace from "./inventory-workspace";
import KitchenItemControls, { priorityLabels } from "./kitchen-item-controls";
import SubscriptionNotice from "./subscription-notice";
import { ExportTools, FullscreenButton } from "./export-tools";
import { PaymentQRSetup, ScanToPay, CustomerContact } from "./payment-tools";
import {
  TeamNoticeStrip,
  OfferSlot,
  OfferEditor,
  NoticeBoard,
} from "./communications";
import { themes, type ThemeId } from "@/lib/themes";
type View =
  | "POS"
  | "Tables"
  | "Kitchen"
  | "Orders"
  | "Inventory"
  | "Insights"
  | "Menu"
  | "Staff";
type Draft = Pick<
  Order,
  | "id"
  | "version"
  | "deliveryServiceId"
  | "deliveryServiceName"
  | "mode"
  | "tableNo"
  | "customer"
  | "contact"
  | "lines"
  | "discountBps"
>;
const uid = () => crypto.randomUUID();
const blank = (): Draft => ({
  id: uid(),
  version: 0,
  mode: "Takeaway",
  tableNo: null,
  customer: "",
  lines: [],
  discountBps: 0,
});
const nav = [
  { name: "POS", icon: Coffee },
  { name: "Tables", icon: LayoutGrid },
  { name: "Kitchen", icon: UtensilsCrossed },
  { name: "Orders", icon: ReceiptText },
  { name: "Inventory", icon: Package },
  { name: "Insights", icon: ChartNoAxesCombined },
] as const;
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function CafeOS() {
  const [data, setData] = useState<AppData | null>(null),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState<View>("POS"),
    [pantryStart,setPantryStart]=useState<"home"|"payroll"|"ca">("home"),
    [draft, setDraft] = useState<Draft | null>(null),
    [unassigned, setUnassigned] = useState<Draft[]>([]),
    [category, setCategory] = useState("All items"),
    [search, setSearch] = useState(""),
    [online, setOnline] = useState(true),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<Product | null>(null),
    [editLine, setEditLine] = useState<string | null>(null),
    [size, setSize] = useState("Regular"),
    [addons, setAddons] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [payments, setPayments] = useState<Payment[]>([]),
    [method, setMethod] = useState<Payment["method"]>("cash"),
    [payAmount, setPayAmount] = useState(""),
    [cashTendered, setCashTendered] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState<Draft[]>([]),
    [loginId, setLoginId] = useState("owner"),
    [password, setPassword] = useState(""),
    [receipt, setReceipt] = useState<Order | null>(null),
    [productEdit, setProductEdit] = useState<Product | null>(null),
    [stockId, setStockId] = useState(""),
    [stockKind, setStockKind] = useState("Adjustment"),
    [stockAmount, setStockAmount] = useState(""),
    [stockReason, setStockReason] = useState(""),
    [stockDate,setStockDate]=useState(indiaDay()),
    [closeCount, setCloseCount] = useState(""),
    [closeNote, setCloseNote] = useState(""),
    [reason, setReason] = useState(""),
    [targetOrder, setTargetOrder] = useState<Order | null>(null),
    [discount, setDiscount] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState("");
  const [themePreview, setThemePreview] = useState<ThemeId | null>(null);
  useEffect(() => {
    const id = themePreview ?? data?.settings.theme ?? "garden";
    document.documentElement.dataset.theme = id;
    const color = themes.find((t) => t.id === id)?.background;
    if (color)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", color);
  }, [data?.settings.theme, themePreview]);
  const hydrated = useRef(""),
    searchRef = useRef<HTMLInputElement>(null),
    paymentId = useRef(""),
    safety = useRef(false);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4200);
  };
  const refresh = async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.status === 401) {
      localStorage.removeItem("cafeos-last-user");
      setData(null);
      return;
    }
    if (!r.ok) throw Error("Could not refresh café data");
    const d = (await r.json()) as AppData;
    setData(d);
    await localWrite(`snapshot:${d.user.id}`, d);
    localStorage.setItem("cafeos-last-user", d.user.id);
    return d;
  };
  useEffect(() => {
    setOnline(navigator.onLine);
    refresh()
      .catch(async () => {
        const id = localStorage.getItem("cafeos-last-user");
        const cached = id
          ? await localRead<AppData>(`snapshot:${id}`)
          : undefined;
        if (cached) {
          setData(cached);
          setOnline(false);
          setError(
            "Server unavailable. Drafts are available on this device; sign in again after reconnecting if your session expired.",
          );
        } else setError("Could not connect. Reconnect to sign in.");
      })
      .finally(() => setLoaded(true));
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    if (hydrated.current === data.user.id) return;
    hydrated.current = data.user.id;
    localRead<Draft>(`draft:${data.user.id}`)
      .then((d) => {
        const saved = d && data.orders.find((o) => o.id === d.id);
        if (saved && saved.status !== "open") {
          setDraft(blank());
          notify(
            "Your previous order is already closed. Its receipt is in Orders.",
          );
        } else setDraft(d ? restoreTableAssignment(d, saved) : blank());
      })
      .catch(() => {
        setDraft(blank());
        setError("Local draft storage is unavailable.");
      });
    localRead<Draft[]>(`unassigned:${data.user.id}`).then(p => setUnassigned(p || []));
    localRead<Draft[]>(`pending:${data.user.id}`).then((p) =>
      setPending(p || []),
    );
    if (data.user.role === "barista") setView("Kitchen");
  }, [data]);
  useEffect(() => {
    if (draft && data?.user.id && hydrated.current === data.user.id)
      localWrite(`draft:${data.user.id}`, draft).catch(() =>
        setError(
          "Local storage is unavailable. Keep this tab open until the order is saved.",
        ),
      );
  }, [draft, data?.user.id]);
  useEffect(() => {
    if (!data || !online) return;
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [data?.user.id, online]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setView("POS");
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const [cartWidth, setCartWidth] = useState(390);
  async function api(action: string, payload: unknown, operationId = uid()) {
    const r = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId, action, payload }),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error || "Please try again");
    return result.result;
  }
  async function perform(fn: () => Promise<void>) {
    if (safety.current) return;
    safety.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      safety.current = false;
      setBusy(false);
    }
  }
  async function save(d = draft) {
    if (!d?.lines.length) throw Error("Add an item first");
    const saved = (await api("saveOrder", d)) as Order;
    setDraft(saved);
    await refresh();
    return saved;
  }
  function replaceDraft(d: Draft) {
    void perform(async () => {
      const currentDraft = draft ? restoreTableAssignment(draft, data?.orders.find(o => o.id === draft.id)) : null;
      let parked = unassigned;
      const next = await prepareOrderSwitch(currentDraft, d, async current => {
        if (!online) throw Error("Reconnect to save this order before switching tables. Your current items are still here.");
        await save(current);
      }, async target => {
        if (!online) return target;
        const latest = await refresh();
        if (!latest) throw Error("Sign in again to open this table.");
        // A table may have been occupied by another counter since the floor loaded.
        if (target.mode === "Dine-in" && target.tableNo) {
          const tableOrder = latest.orders.find(o => o.status === "open" && o.tableNo === target.tableNo);
          return tableOrder ?? { ...blank(), mode: "Dine-in", tableNo: target.tableNo };
        }
        const saved = latest.orders.find(o => o.id === target.id);
        if (saved && saved.status !== "open") throw Error("This order has already been closed. Open another order.");
        return saved ?? target;
      }, async (current, target) => {
        if (target.mode === "Dine-in" && target.tableNo && target.version === 0) {
          if (!online) throw Error("Reconnect to assign this order to a table. Your items are still here.");
          return await save({ ...current, tableNo: target.tableNo });
        }
        parked = [...parked.filter(p => p.id !== current.id), current];
        await localWrite(`unassigned:${data!.user.id}`, parked);
        setUnassigned(parked);
        notify("Unassigned order kept on this device. Resume it from the order panel.");
        return target;
      });
      if (parked.some(p => p.id === next.id)) {
        const remaining = parked.filter(p => p.id !== next.id);
        await localWrite(`unassigned:${data!.user.id}`, remaining);
        setUnassigned(remaining);
      }
      setDraft(next);
      setView("POS");
    });
  }
  function add(p: Product) {
    if (!p.available) return;
    if (!draft) return;
    const defaultSize = Object.hasOwn(p.variants, "Regular")
      ? "Regular"
      : Object.keys(p.variants)[0] || "Regular";
    const defaultPrice = p.price + (p.variants[defaultSize] || 0);
    const existing = draft.lines.find(
      (l) =>
        l.productId === p.id &&
        l.size === defaultSize &&
        !l.addons.length &&
        !l.note &&
        l.sentQty === 0,
    );
    if (existing && existing.qty >= 99) {
      setError("Maximum 99 per item line. Add a separate line if needed.");
      return;
    }
    if (existing) {
      setDraft({
        ...draft,
        lines: draft.lines.map((l) =>
          l.id === existing.id ? { ...l, qty: l.qty + 1 } : l,
        ),
      });
    } else
      setDraft({
        ...draft,
        lines: [
          ...draft.lines,
          {
            id: uid(),
            productId: p.id,
            name: p.name,
            qty: 1,
            size: defaultSize,
            addons: [],
            note: "",
            price: defaultPrice,
            taxBps: p.taxBps,
            station: p.station,
            recipe: p.recipe,
            sentQty: 0,
          },
        ],
      });
  }
  function quantity(id: string, delta: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      lines: draft.lines.flatMap((l) => {
        if (l.id !== id) return [l];
        const qty = l.qty + delta;
        if (qty < l.sentQty) {
          setError("Items already sent to the kitchen cannot be removed.");
          return [l];
        }
        return qty > 0 ? [{ ...l, qty }] : [];
      }),
    });
  }
  function openModifiers(l: Line) {
    if (l.sentQty) {
      setError(
        "This item is already in the kitchen. Add a new item for a different customisation.",
      );
      return;
    }
    const p = data?.products.find((p) => p.id === l.productId);
    if (!p) return;
    setSelected(p);
    setEditLine(l.id);
    setSize(l.size);
    setAddons(l.addons);
    setNote(l.note);
    setModal("modifiers");
  }
  function applyModifiers() {
    if (!draft || !selected) return;
    const price =
      selected.price +
      (selected.variants[size] || 0) +
      addons.reduce((s, a) => s + selected.addons[a], 0);
    setDraft({
      ...draft,
      lines: draft.lines.map((l) =>
        l.id === editLine ? { ...l, size, addons, note, price } : l,
      ),
    });
    setModal("");
    notify("Customisation saved");
  }
  async function hold() {
    if (!draft?.lines.length) throw Error("Add an item first");
    if (!online) {
      const next = [...pending.filter((p) => p.id !== draft.id), draft];
      setPending(next);
      await localWrite(`pending:${data!.user.id}`, next);
      setDraft(blank());
      notify("Held on this device · waiting to sync");
      return;
    }
    await save();
    setDraft(blank());
    notify("Order held. Find it in Orders.");
  }
  async function sync() {
    let remaining = [...pending];
    for (const d of pending) {
      await api("saveOrder", d, `offline-${d.id}`);
      remaining = remaining.filter((p) => p.id !== d.id);
      setPending(remaining);
      await localWrite(`pending:${data!.user.id}`, remaining);
    }
    await refresh();
    notify("Local orders synced");
  }
  async function kitchen() {
    const o = await save();
    const sent = (await api("sendKitchen", {
      id: o.id,
      version: o.version,
    })) as Order;
    setDraft(sent);
    await refresh();
    notify("Sent to kitchen · recipe stock updated");
  }
  function printBill(back = false, bill = receipt) {
    if (!bill) return;
    const frame = document.createElement("iframe");
    frame.title = "Print bill";
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0";
    frame.onload = async () => {
      const target = frame.contentWindow;
      if (!target) return;
      await target.document.fonts.ready;
      target.addEventListener("afterprint", () => frame.remove(), { once: true });
      target.focus();
      target.print();
      if (back) { closeModal(); setView("POS"); }
    };
    frame.src = `/receipt/${bill.id}`;
    document.body.appendChild(frame);
  }
  async function openPay() {
    const o = await save();
    paymentId.current = uid();
    setPayments([]);
    setMethod("cash");
    setCashTendered("");
    setPayAmount((o.total / 100).toFixed(2));
    setReference("");
    setConfirmed(false);
    setModal("payment");
  }
  function paymentPart() {
    const amount = Math.round(Number(payAmount) * 100);
    if (!Number.isFinite(amount) || amount <= 0)
      throw Error("Enter a valid payment amount");
    if (method !== "cash" && (!reference.trim() || !confirmed))
      throw Error("Enter a reference and confirm the payment externally");
    const tendered =
      cashTendered === "" ? amount : Math.round(Number(cashTendered) * 100);
    if (
      method === "cash" &&
      (!Number.isSafeInteger(tendered) || tendered < amount)
    )
      throw Error("Cash tendered must cover the cash payment");
    return {
      method,
      amount,
      ...(method === "cash" ? { tendered, change: tendered - amount } : {}),
      ...(method !== "cash" ? { reference: reference.trim(), confirmed } : {}),
    };
  }
  function addPayment() {
    try {
      const next = [...payments, paymentPart()];
      if (next.reduce((s, p) => s + p.amount, 0) > sum.total)
        throw Error("Payment exceeds the balance");
      setPayments(next);
      setCashTendered("");
      setPayAmount(
        ((sum.total - next.reduce((s, p) => s + p.amount, 0)) / 100).toFixed(2),
      );
      setReference("");
      setConfirmed(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function checkout() {
    if (!draft) return;
    const parts = [...payments];
    if (Number(payAmount) > 0) parts.push(paymentPart());
    if (parts.reduce((s, p) => s + p.amount, 0) !== sum.total)
      throw Error("Payment amounts must equal the bill total");
    const result = (await api(
      "checkout",
      {
        id: draft.id,
        version: draft.version,
        payments: parts,
        customer: draft.customer,
        contact: draft.contact,
      },
      paymentId.current,
    )) as Order;
    setReceipt(result);
    setDraft(blank());
    setModal("receipt");
    await refresh();
    notify("Payment recorded. You’re all set.");
  }
  async function doLogin(e: FormEvent) {
    e.preventDefault();
    await perform(async () => {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loginId, password }),
      });
      const x = await r.json();
      if (!r.ok) throw Error(x.error);
      hydrated.current = "";
      setPassword("");
      await refresh();
    });
  }
  const manager = !!data && ["owner", "manager"].includes(data.user.role),
    barista = data?.user.role === "barista";
  const sum = totals(draft?.lines || [], draft?.discountBps || 0);
  const today =
    data?.orders.filter((o) => o.paidAt && indiaDay(o.paidAt) === indiaDay()) ||
    [];
  const revenue = today.reduce((s, o) => s + o.total - o.refund, 0);
  const openOrders = data?.orders.filter((o) => o.status === "open") || [];
  const activeTickets =
    data?.tickets.filter((t) => !["Served", "Cancelled"].includes(t.status)) ||
    [];
  const visible =
    data?.products.filter(
      (p) =>
        (category === "All items" || p.category === category) &&
        (p.name + " " + p.description)
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const popular =
    data?.products
      .filter((p) => p.available)
      .map((p) => ({
        p,
        count: data.orders
          .filter((o) => o.status === "paid")
          .flatMap((o) => o.lines)
          .filter((l) => l.productId === p.id)
          .reduce((s, l) => s + l.qty, 0),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3) || [];
  const closeModal = () => {
    if (!busy) {
      setModal("");
      setThemePreview(null);
      setError("");
    }
  };
  if (!loaded)
    return (
      <main className="loading">
        <Coffee size={38} />
        <p>Opening your café…</p>
      </main>
    );
  if (!data)
    return (
      <main className="login-page">
        <div className="login-brand">
          <div className="brand-mark">
            <Coffee />
          </div>
          <span>
            CaféOS<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="login-wrap">
          <div className="login-story">
            <span className="eyebrow">A LITTLE LESS BUSYWORK.</span>
            <h1>
              Good coffee.
              <br />
              Great company.
              <br />
              <em>We’ll handle the rest.</em>
            </h1>
            <p>
              A calmer way to run your café. From the first order to the last
              cup.
            </p>
            <div className="login-foot">
              <ShieldCheck size={18} /> Your café data stays on this local
              server.
            </div>
          </div>
          <form className="login-form" onSubmit={doLogin}>
            <span className="eyebrow">THE DAILY GRIND · LOCAL WORKSPACE</span>
            <h2>Welcome to your shift.</h2>
            <p>Sign in to open your café workspace.</p>
            <label>
              Staff account
              <select
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              >
                <option value="owner">Aarav · Owner</option>
                <option value="manager">Meera · Manager</option>
                <option value="cashier">Riya · Cashier</option>
                <option value="barista">Kabir · Barista</option>
              </select>
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Open workspace"}
              <ArrowRight size={18} />
            </button>
            <small>
              Starter passwords are in <code>data/starter-credentials.txt</code>
              . Change them in Staff before operational use.
            </small>
          </form>
        </div>
        <div className="login-bottom">
          Made for the way cafés actually work.
          <span>Orders · Kitchen · Billing · Stock</span>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          className="brand-mark"
          aria-label="CaféOS point of sale"
          onClick={() => setView(barista ? "Kitchen" : "POS")}
        >
          <Coffee size={25} />
        </button>
        <nav aria-label="Main navigation">
          {nav
            .filter((n) =>
              barista
                ? n.name === "Kitchen"
                : manager || !["Insights", "Inventory"].includes(n.name),
            )
            .map((n) => (
              <button
                key={n.name}
                className={`nav-item ${view === n.name ? "active" : ""}`}
                onClick={() => {
                  if (n.name === "Inventory") setPantryStart("home");
                  setView(n.name);
                  setError("");
                }}
                aria-current={view === n.name ? "page" : undefined}
              >
                <n.icon size={22} />
                <span>{n.name}</span>
                {n.name === "Kitchen" && activeTickets.length > 0 && (
                  <i>{activeTickets.length}</i>
                )}
              </button>
            ))}
        </nav>
        <div className="rail-bottom">
          {manager && (
            <button
              className={`nav-item ${view === "Menu" ? "active" : ""}`}
              onClick={() => setView("Menu")}
            >
              <Settings2 size={22} />
              <span>Menu</span>
            </button>
          )}
          <button
            className={`avatar ${view === "Staff" ? "selected" : ""}`}
            aria-label="Staff and account"
            onClick={() => setView("Staff")}
          >
            {data.user.name
              .split(" ")
              .map((x) => x[0])
              .join("")}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="wordmark">
            CaféOS<span>.</span>
            <span className="divider" />
            <span className="outlet-name">
              {data.settings.outlet}
              <small>INDIRANAGAR, BENGALURU</small>
            </span>
          </div>
          <TeamNoticeStrip
            notices={data.notices ?? []}
            canWrite={manager}
            onOpen={() => setModal("notices")}
          />
          <div className="topbar-right">
            <SubscriptionNotice subscription={data.subscription} />
            <FullscreenButton />
            {data.user.role === "owner" && (
              <button
                className="theme-trigger"
                aria-label="Team mood and theme"
                title="Team mood & theme"
                onClick={() => {
                  setThemePreview(data.settings.theme ?? "garden");
                  setModal("theme");
                }}
              >
                <Palette size={19} />
                <span>Team mood</span>
              </button>
            )}
            <span className={`connection ${!online ? "offline" : ""}`}>
              <i />
              {online ? "System online" : "Offline · drafts only"}
            </span>
            {pending.length > 0 && (
              <button
                className="subtle"
                onClick={() => perform(sync)}
                disabled={busy || !online}
              >
                <RefreshCw size={15} />
                {pending.length} to sync
              </button>
            )}
            <span className="date-label">
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "short",
                weekday: "short",
              }).format(new Date())}
            </span>
          </div>
        </header>
        {error && (
          <div className="error global-error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {view === "POS" && draft && (
          <div className="pos-layout" style={{ "--cart-width": `${cartWidth}px` } as React.CSSProperties}>
            <main className="menu-zone">
              <div className="page-heading menu-heading">
                <div>
                  <span className="eyebrow">LET’S MAKE SOMETHING GOOD</span>
                  <h1>
                    On the menu<span className="muted-dot">.</span>
                  </h1>
                  <p>A good day starts with a great cup.</p>
                </div>
                <OfferSlot
                  offer={data.offer ?? null}
                  owner={data.user.role === "owner"}
                  hasSaved={!!data.offerEditor}
                  onEdit={() => setModal("offer")}
                />
                <div className="order-mode" aria-label="Order mode">
                  {["Dine-in", "Takeaway", "Delivery pickup"].map((m) => (
                    <button
                      className={draft.mode === m ? "active" : ""}
                      key={m}
                      onClick={() => {
                        if (draft.mode !== m) setDraft({ ...draft, mode: m, tableNo: null, deliveryServiceId: undefined, deliveryServiceName: undefined });
                      }}
                    >
                      {m === "Delivery pickup" ? "Pickup" : m}
                    </button>
                  ))}
                  <select aria-label="Online delivery service" value={draft.mode === "Online delivery" ? draft.deliveryServiceId || "" : ""} onChange={e => {const service=data.deliveryServices.services.find(s=>s.id===e.target.value); if(service) setDraft({...draft,mode:"Online delivery",tableNo:null,deliveryServiceId:service.id,deliveryServiceName:service.name});}}>
                    <option value="" disabled>Online delivery</option>
                    {data.deliveryServices.services.filter(s=>s.active || s.id===draft.deliveryServiceId).map(s=><option key={s.id} value={s.id}>{s.name}{!s.active ? " (removed)" : ""}</option>)}
                  </select>
                </div>
              </div>
              <div className="search-wrap">
                <Search size={19} />
                <input
                  ref={searchRef}
                  aria-label="Search the menu"
                  placeholder="Search coffee, food, or a little treat…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>⌘ K</kbd>
              </div>
              <div className="category-tabs" aria-label="Menu categories">
                {[
                  "All items",
                  ...new Set(data.products.map((p) => p.category)),
                ].map((c) => (
                  <button
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                    key={c}
                  >
                    {c}
                    {c === "All items" && <span>{data.products.length}</span>}
                  </button>
                ))}
              </div>
              {!search && category === "All items" && (
                <div className="quick-strip">
                  <span>
                    <Flame size={16} /> Quick favourites
                  </span>
                  {popular.map(({ p }) => (
                    <button key={p.id} onClick={() => add(p)}>
                      {p.name}
                      <Plus size={14} />
                    </button>
                  ))}
                </div>
              )}
              <div className="grid-label">
                <h2>
                  {search
                    ? "Search results"
                    : category === "All items"
                      ? "A little of everything"
                      : category}
                </h2>
                <span>{visible.length} items · prices before tax</span>
              </div>
              <div className="product-grid">
                {visible.map((p, i) => (
                  <button
                    key={p.id}
                    disabled={!p.available}
                    className={`product-card tone-${i % 5}`}
                    onClick={() => add(p)}
                    aria-label={`Add ${p.name}, ${money(p.price)}`}
                  >
                    <div className="product-art">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          width={1536}
                          height={1024}
                          loading={i < 4 ? "eager" : "lazy"}
                          decoding="async"
                        />
                      ) : (
                        <span aria-hidden="true">{p.emoji}</span>
                      )}
                      <span className="veg-mark" aria-label="Vegetarian">
                        <i />
                      </span>
                      {!p.available ? (
                        <span className="sold-out">Unavailable</span>
                      ) : p.category === "Combos" ? (
                        <span className="product-tag">A perfect pair</span>
                      ) : null}
                    </div>
                    <div className="product-info">
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <div>
                        <strong>{money(p.price)}</strong>
                        <span className="add-circle">
                          <Plus size={17} />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {!visible.length && (
                <div className="empty">
                  <Search />
                  <h3>No items found</h3>
                  <p>Try a different name or category.</p>
                </div>
              )}
              <footer className="menu-footer">
                <Leaf size={15} /> Thoughtfully made. Happily served.
                <span>All prices in INR</span>
              </footer>
            </main>
            <aside className="cart-zone" id="current-order">
              <div className="cart-resize" role="separator" aria-label="Resize order panel" aria-orientation="vertical" tabIndex={0} onKeyDown={e => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setCartWidth(w => Math.max(300, Math.min(650, w + (e.key === "ArrowLeft" ? 20 : -20)))); }
              }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) setCartWidth(Math.max(300, Math.min(650, window.innerWidth - e.clientX)));
              }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)} />

              {unassigned.length > 0 && <div className="unassigned-orders" role="region" aria-label="Unassigned orders">
                {unassigned.map(p => <button key={p.id} type="button" className="secondary" disabled={busy} onClick={() => replaceDraft(p)}>Resume unassigned order · {p.lines.reduce((sum, l) => sum + l.qty, 0)} items</button>)}
              </div>}
              {draft.mode === "Dine-in" && !draft.tableNo && <p className="table-selection-help">Choose a table below or on the floor. Your items will follow to a free table.</p>}
              <div className="cart-heading">
                <div>
                  <span className="eyebrow">
                    {draft.version ? "SAVED ORDER" : "NEW ORDER"}
                  </span>
                  <h2>
                    Current order{" "}
                    <span>{draft.lines.reduce((s, l) => s + l.qty, 0)}</span>
                  </h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Clear unsaved order"
                  disabled={draft.version > 0}
                  onClick={() => {
                    setDraft(blank());
                    notify("Started a fresh order");
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="order-context">
                <span>
                  <i />
                  {orderServiceLabel(draft)}
                </span>
                {draft.mode === "Dine-in" ? (
                  <select
                    aria-label="Table number"
                    value={draft.tableNo || ""}
                    disabled={busy}
                    onChange={e => {
                      const n = Number(e.target.value);
                      if (!n || n === draft.tableNo) return;
                      replaceDraft(data.orders.find(o => o.status === "open" && o.tableNo === n) || { ...blank(), mode: "Dine-in", tableNo: n });
                    }}
                  >
                    <option value="">Choose table</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Table {String(n).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="order-label">
                    {draft.version
                      ? `#${data.orders.find((o) => o.id === draft.id)?.number || "—"}`
                      : "Counter order"}
                  </span>
                )}
              </div>
              <div className="cart-lines">
                {draft.lines.length ? (
                  draft.lines.map((l) => (
                    <div className="cart-line" key={l.id}>
                      <div className="line-top">
                        <button onClick={() => openModifiers(l)}>
                          <strong>{l.name}</strong>
                          <small>
                            {l.size}
                            {l.addons.length ? " · " + l.addons.join(", ") : ""}
                            {l.note ? " · " + l.note : ""}
                          </small>
                        </button>
                        <strong>{money(l.price * l.qty)}</strong>
                      </div>
                      <div className="cart-priority"><span>Serving priority</span><div className="priority-chips" role="group" aria-label={`Serving priority for ${l.name}`}>
                        {Object.entries(priorityLabels).map(([v,label]) => <button key={v} type="button" className={`priority-tag priority-${v}`} aria-pressed={(l.priority ?? "normal") === v} disabled={busy || (!!l.sentQty && !online)} onClick={() => {
                          const next = { ...draft, lines: draft.lines.map(line => line.id === l.id ? { ...line, priority: v as "first" | "normal" | "later" } : line) };
                          setDraft(next);
                          if (l.sentQty) void perform(async () => { await save(next); notify("Serving priority sent to kitchen"); });
                        }}>{label}</button>)}
                      </div></div>
                      <div className="line-bottom">
                        <button
                          className="customize"
                          onClick={() => openModifiers(l)}
                        >
                          {l.sentQty ? (
                            <>
                              <Check size={12} /> Sent ({l.sentQty})
                            </>
                          ) : (
                            <>
                              <Settings2 size={12} /> Customise
                            </>
                          )}
                        </button>
                        <div className="stepper">
                          <button
                            aria-label={`Decrease ${l.name}`}
                            onClick={() => quantity(l.id, -1)}
                            disabled={l.qty <= l.sentQty}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{l.qty}</span>
                          <button
                            aria-label={`Increase ${l.name}`}
                            onClick={() => quantity(l.id, 1)}
                            disabled={l.qty >= 99}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-cart">
                    <div>
                      <Coffee size={32} />
                    </div>
                    <h3>A fresh start.</h3>
                    <p>
                      Pick something delicious
                      <br />
                      from the menu to begin.
                    </p>
                    <span>One tap to add. Just like that.</span>
                  </div>
                )}
              </div>
              <div className="cart-bottom">
                <label className="customer-input">
                  <Users size={16} />
                  <input
                    placeholder="Customer name for loyalty (optional)"
                    aria-label="Customer name for loyalty"
                    value={draft.customer}
                    onChange={(e) =>
                      setDraft({ ...draft, customer: e.target.value })
                    }
                  />
                </label>
                <div className="bill-lines">
                  <div>
                    <span>Subtotal</span>
                    <span>{money(sum.subtotal)}</span>
                  </div>
                  <div>
                    <span>
                      {data.settings.taxLabel} <small>(item-wise)</small>
                    </span>
                    <span>{money(sum.tax)}</span>
                  </div>
                  <div>
                    <button
                      onClick={() => {
                        setDiscount(String(draft.discountBps / 100));
                        setModal("discount");
                      }}
                      disabled={!manager}
                    >
                      Discount{" "}
                      {draft.discountBps > 0
                        ? `(${draft.discountBps / 100}%)`
                        : manager
                          ? "+"
                          : ""}
                    </button>
                    <span>
                      {sum.discount ? "-" + money(sum.discount) : "—"}
                    </span>
                  </div>
                </div>
                <div className="total-row">
                  <span>Total payable</span>
                  <strong>{money(sum.total)}</strong>
                </div>
                <button
                  className="primary pay-button"
                  onClick={() => perform(openPay)}
                  disabled={busy || !online || !draft.lines.length}
                >
                  <Wallet size={19} /> Proceed to payment{" "}
                  <ArrowRight size={19} />
                </button>
                <button className="secondary payment-kitchen" onClick={() => perform(openPay)} disabled={busy || !online || !draft.lines.length}>
                  <Wallet size={18} /> Payment &amp; Send to kitchen <Send size={18} />
                </button>
                <div className="cart-actions">
                  <button
                    onClick={() => perform(hold)}
                    disabled={busy || !draft.lines.length}
                  >
                    <Pause size={16} /> Hold order
                  </button>
                  <button
                    onClick={() => perform(kitchen)}
                    disabled={
                      busy ||
                      !online ||
                      !draft.lines.some((l) => l.qty > l.sentQty)
                    }
                  >
                    <Send size={16} /> Send to kitchen
                  </button>
                </div>
                <p className="cart-hint">
                  <ShieldCheck size={12} /> Draft saved on this device ·{" "}
                  {online ? "ready to bill" : "payment needs connection"}
                </p>
              </div>
            </aside>
          </div>
        )}
        {view === "Tables" && (
          <main className="page-content">
            <PageTitle
              eyebrow="A PLACE FOR EVERYONE"
              title="The floor"
              description="Open a table to keep the good times flowing."
            />
            <div className="legend">
              <span>
                <i className="green" /> Available
              </span>
              <span>
                <i className="orange" /> Occupied
              </span>
              <span>
                {openOrders.filter((o) => o.tableNo).length} of 12 tables in use
              </span>
            </div>
            <div className="table-grid">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
                const o = openOrders.find((o) => o.tableNo === n);
                return (
                  <article key={n} className={`table-card ${o ? "occupied" : ""}`}>
                  <button className="table-open" aria-label={`${o ? "Open order for" : "Start order for"} table ${n}`}
                    disabled={busy}
                    onClick={() =>
                      replaceDraft(
                        o || { ...blank(), mode: "Dine-in", tableNo: n },
                      )
                    }
                  >
                    <div className="table-top">
                      <span>{o ? "Occupied" : "Available"}</span>
                      <span>{n <= 4 ? "2 seats" : "4 seats"}</span>
                    </div>
                    <div className="table-shape">
                      <UtensilsCrossed size={22} />
                      <strong>{String(n).padStart(2, "0")}</strong>
                    </div>
                    <div className="table-bottom">
                      {o ? (
                        <>
                          <span>
                            #{o.number} ·{" "}
                            {o.lines.reduce((s, l) => s + l.qty, 0)} items
                          </span>
                          <strong>{money(o.total)}</strong>
                        </>
                      ) : (
                        <span>
                          Start a new order <Plus size={15} />
                        </span>
                      )}
                    </div>
                  </button>
                  {o && <div className="table-quick-actions">
                    <span>{Math.max(0, Math.floor((Date.now() - Date.parse(o.createdAt)) / 60000))} min running</span>
                    <button type="button" className="icon-button" aria-label={`View bill for table ${n}`} title="View running bill" disabled={busy} onClick={() => { setReceipt(o); setModal("receipt"); }}><Eye size={19} /></button>
                    <button type="button" className="icon-button" aria-label={`Print bill for table ${n}`} title="Print running bill" disabled={busy || !online} onClick={() => printBill(false, o)}><Printer size={19} /></button>
                  </div>}
                  </article>
                );
              })}
            </div>
          </main>
        )}
        {view === "Kitchen" && (
          <main className="page-content kitchen-page">
            <PageTitle
              eyebrow="A LITTLE RHYTHM. A LOT OF CRAFT."
              title="Behind the counter"
              description="Every order, just the way they like it."
              action={
                <span className="pill">
                  <i className="live-dot" />
                  {activeTickets.length} active tickets
                </span>
              }
            />
            <div className="kitchen-lanes">
              {["Barista", "Kitchen"].map((station) => (
                <section key={station}>
                  <div className="section-heading">
                    <h2>
                      {station === "Barista" ? (
                        <Coffee size={21} />
                      ) : (
                        <UtensilsCrossed size={21} />
                      )}{" "}
                      {station} station
                    </h2>
                    <span>
                      {
                        activeTickets.filter((t) => t.station === station)
                          .length
                      }{" "}
                      waiting
                    </span>
                  </div>
                  {activeTickets
                    .filter((t) => t.station === station)
                    .map((t) => (
                      <article className="ticket" key={t.id}>
                        <div className="ticket-head">
                          <strong>Order #{t.orderNumber}</strong>
                          <span className={`status ${t.status.toLowerCase()}`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="ticket-service">{t.serviceLabel}</p>
                        {t.customer && <p className="ticket-customer">{t.customer}</p>}
                        <p className="ticket-time">
                          <Clock size={13} />
                          {new Date(t.createdAt).toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          ·{" "}
                          {Math.max(
                            0,
                            Math.floor(
                              (Date.now() - Date.parse(t.createdAt)) / 60000,
                            ),
                          )}{" "}
                          min ago
                        </p>
                        {t.lines.map((l, i) => ({ l, i })).sort((a, b) =>
                          ({ first: 0, normal: 1, later: 2 }[a.l.priority ?? "normal"]) - ({ first: 0, normal: 1, later: 2 }[b.l.priority ?? "normal"])
                        ).map(({ l, i }, position) => (
                          <div className="ticket-line" key={i}>
                            <b className="item-sequence">{String(position + 1).padStart(2, "0")}</b>
                            <div>
                              <div className="kitchen-item-heading"><strong>{l.name}</strong><span className="item-quantity"><small>Qty.</small> ×{l.qty}</span></div>
                              <p>
                                {l.size}
                                {l.addons.length
                                  ? " · " + l.addons.join(", ")
                                  : ""}
                              </p>
                              <p className="item-instructions">{l.note || "NA"}</p>
                              <KitchenItemControls ticket={t} index={i} disabled={busy || !online} chef={data.user.role !== "cashier"} run={async (action, payload) => {
                                await perform(async () => {
                                  await api(action, payload);
                                  await refresh();
                                  notify(action === "ticketItemPriority" ? "Serving priority updated" : "Kitchen item updated");
                                });
                              }} />
                            </div>
                          </div>
                        ))}
                      </article>
                    ))}
                  {!activeTickets.some((t) => t.station === station) && (
                    <div className="empty station-empty">
                      <CheckCircle2 size={30} />
                      <h3>All caught up.</h3>
                      <p>
                        New {station === "Barista" ? "drinks" : "food orders"}{" "}
                        will appear here.
                      </p>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </main>
        )}
        {view === "Orders" && (
          <main className="page-content">
            <PageTitle
              eyebrow="FROM FIRST SIP TO LAST BITE"
              title="Every order, in order."
              description="Resume an open tab or revisit a completed bill."
            />
            <ExportTools kind="orders" online={online} />
            <div className="summary-strip">
              <div>
                <span>Open orders</span>
                <strong>{openOrders.length}</strong>
              </div>
              <div>
                <span>Completed today</span>
                <strong>
                  {today.filter((o) => o.status === "paid").length}
                </strong>
              </div>
              <div>
                <span>Net sales today</span>
                <strong>{money(revenue)}</strong>
              </div>
            </div>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Service</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>#{o.number}</strong>
                        <small>
                          {new Date(o.createdAt).toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </td>
                      <td>
                        {orderServiceLabel(o)}
                      </td>
                      <td>{o.customer || "Walk-in"}</td>
                      <td>{money(o.total)}</td>
                      <td>
                        <span className={`status ${o.status}`}>{o.status}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {o.status === "open" ? (
                            <>
                              <button
                                className="subtle"
                                onClick={() => replaceDraft(o)}
                              >
                                Resume <ArrowUpRight size={14} />
                              </button>
                              {manager && (
                                <button
                                  className="danger-text"
                                  onClick={() => {
                                    setTargetOrder(o);
                                    setReason("");
                                    setModal("cancel");
                                  }}
                                >
                                  Cancel
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                className="subtle"
                                onClick={() => {
                                  setReceipt(o);
                                  setModal("receipt");
                                }}
                              >
                                Receipt <Printer size={14} />
                              </button>
                              {manager && o.status === "paid" && (
                                <button
                                  className="danger-text"
                                  onClick={() => {
                                    setTargetOrder(o);
                                    setReason("");
                                    setConfirmed(false);
                                    setModal("refund");
                                  }}
                                >
                                  Refund
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.orders.length && (
                <div className="empty">
                  <ReceiptText />
                  <h3>Your first order is waiting.</h3>
                  <p>Completed and held orders will live here.</p>
                </div>
              )}
            </div>
          </main>
        )}
        {view === "Inventory" && manager && (
          <InventoryWorkspace initialPane={pantryStart} data={data} busy={busy} online={online} run={async (action, payload, operationId) => {
            let succeeded = false;
            await perform(async () => {
              await api(action, payload, operationId);
              await refresh();
              succeeded = true;
            });
            return succeeded;
          }} stock={openPurchases => <>
            <PageTitle
              eyebrow="A WELL-STOCKED KIND OF DAY"
              title="Stock & pantry"
              description="Recipe consumption is recorded when items go to the kitchen."
              action={
                <button
                  className="primary compact"
                  onClick={openPurchases}
                >
                  <Plus size={17} /> Receive stock
                </button>
              }
            />
            <ExportTools kind="inventory" online={online} />
            {data.ingredients.some((i) => i.stock < i.low) && (
              <div className="notice">
                <Package size={21} />
                <div>
                  <strong>A small heads-up for your next purchase.</strong>
                  <p>
                    {data.ingredients
                      .filter((i) => i.stock < i.low)
                      .map((i) => i.name)
                      .join(", ")}{" "}
                    below the configured reorder level.
                  </p>
                </div>
              </div>
            )}
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>On hand</th>
                    <th>Reorder level</th>
                    <th>Stock health</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ingredients.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.name}</strong>
                      </td>
                      <td>
                        {i.stock.toLocaleString("en-IN")} {i.unit}
                      </td>
                      <td>
                        {i.low} {i.unit}
                      </td>
                      <td>
                        <span
                          className={`status ${i.stock < i.low ? "low" : "paid"}`}
                        >
                          {i.stock < i.low ? "Running low" : "Well stocked"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="subtle"
                          onClick={() => {
                            setStockId(i.id);
                            setStockKind("Adjustment");
                            setStockDate(indiaDay());
                            setStockAmount("");
                            setStockReason("");
                            setModal("stock");
                          }}
                        >
                          Adjust <Settings2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="panel">
              <h2>Tomorrow’s prep, made simpler</h2>
              <p className="muted">
                Explainable estimate: today’s recipe usage × 1.2 buffer. This is
                a planning rule, not an AI forecast.
              </p>
              {data.ingredients.map((i) => {
                const usage = today
                  .filter((o) => o.status !== "cancelled")
                  .flatMap((o) => o.lines)
                  .reduce((s, l) => s + (l.recipe[i.id] || 0) * l.sentQty, 0);
                return usage * 1.2 > i.stock ? (
                  <p key={i.id} className="forecast">
                    {i.name}: {Math.ceil(usage * 1.2)} {i.unit} estimated need;{" "}
                    {i.stock} {i.unit} available.
                  </p>
                ) : null;
              })}
              <p className="muted">
                See stock health above for minimum-level alerts.
              </p>
            </section>
          </>} />
        )}
        {view === "Insights" && manager && (
          <main className="page-content">
            <PageTitle
              eyebrow="THE BIG PICTURE, WITHOUT THE BUSYWORK"
              title="How’s the café doing?"
              description="Today, in a few useful numbers. Asia/Kolkata time."
              action={
                <button
                  className="secondary compact"
                  onClick={() => {
                    setCloseCount("");
                    setCloseNote("");
                    setModal("closing");
                  }}
                >
                  <CheckCircle2 size={17} /> Close the day
                </button>
              }
            />
            <div className="metric-grid">
              <Metric
                title="Net revenue"
                value={money(revenue)}
                hint="Sales less full refunds"
              />
              <Metric
                title="Completed orders"
                value={String(today.filter((o) => o.status === "paid").length)}
                hint="Paid, non-refunded bills"
              />
              <Metric
                title="Average order"
                value={money(
                  today.filter((o) => o.status === "paid").length
                    ? Math.round(
                        revenue /
                          today.filter((o) => o.status === "paid").length,
                      )
                    : 0,
                )}
                hint="Per completed order"
              />
              <Metric
                title="Discounts / refunds"
                value={`${money(today.reduce((s, o) => s + o.discount, 0))} / ${money(today.reduce((s, o) => s + o.refund, 0))}`}
                hint="Recorded on today’s bills"
              />
            </div>
            <div className="insight-grid">
              <section className="panel">
                <div className="section-heading">
                  <h2>Sales throughout the day</h2>
                  <span>Net sales · INR</span>
                </div>
                <div className="bar-chart">
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                    const amount = today
                      .filter(
                        (o) =>
                          Number(
                            new Intl.DateTimeFormat("en-GB", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              hourCycle: "h23",
                            }).format(new Date(o.paidAt!)),
                          ) === hour,
                      )
                      .reduce((s, o) => s + o.total - o.refund, 0);
                    return (
                      <div key={hour} title={`${hour}:00 — ${money(amount)}`}>
                        <span>{amount ? money(amount) : ""}</span>
                        <i
                          style={{
                            height: `${revenue ? Math.max(2, (amount / revenue) * 140) : 2}px`,
                          }}
                        />
                        <small>{hour}</small>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <h2>How customers paid</h2>
                {(["cash", "upi", "card"] as const).map((method) => (
                  <div className="report-row" key={method}>
                    <span>{method.toUpperCase()}</span>
                    <strong>
                      {money(
                        today
                          .filter((o) => o.status === "paid")
                          .flatMap((o) => o.payments)
                          .filter((p) => p.method === method)
                          .reduce((s, p) => s + p.amount, 0),
                      )}
                    </strong>
                  </div>
                ))}
                <small className="muted">
                  UPI and card are manually confirmed external payments.
                </small>
              </section>
              <section className="panel">
                <h2>Customer favourites</h2>
                {popular.map(({ p, count }, i) => (
                  <div className="report-row" key={p.id}>
                    <span>
                      <b className="rank">0{i + 1}</b>
                      {p.name}
                    </span>
                    <strong>{count} sold</strong>
                  </div>
                ))}
                <small className="muted">
                  Based on all completed, non-refunded orders.
                </small>
              </section>
              <section className="panel ask-panel">
                <span className="eyebrow">ASK YOUR CAFÉ · RULE-BASED</span>
                <h2>Small questions. Clear answers.</h2>
                <p className="muted">
                  Try “best seller”, “reorder” or “sales”. No AI key needed.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = question.toLowerCase();
                    setAnswer(
                      q.includes("best")
                        ? popular[0]?.count
                          ? `${popular[0].p.name} leads with ${popular[0].count} sold across completed orders.`
                          : "No completed sales yet."
                        : q.includes("stock") || q.includes("reorder")
                          ? data.ingredients
                              .filter((i) => i.stock < i.low)
                              .map(
                                (i) =>
                                  `${i.name}: ${i.stock} ${i.unit}, reorder level ${i.low}`,
                              )
                              .join("; ") ||
                            "All ingredients are above their minimum levels."
                          : q.includes("sales") || q.includes("revenue")
                            ? `Today’s net revenue is ${money(revenue)} = recorded bill totals less full refunds.`
                            : "I can answer best seller, reorder, or sales using your recorded data.",
                    );
                  }}
                >
                  <input
                    aria-label="Ask your café"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What needs reordering?"
                  />
                  <button className="icon-button" aria-label="Ask question">
                    <ArrowRight size={19} />
                  </button>
                </form>
                {answer && (
                  <p className="answer" role="status">
                    {answer}
                  </p>
                )}
              </section>
            </div>
            {data.closings.length > 0 && (
              <section className="panel">
                <h2>Day closing records</h2>
                {data.closings
                  .slice(-5)
                  .reverse()
                  .map((c) => (
                    <div className="report-row" key={c.id}>
                      <span>
                        {c.date} · expected cash {money(c.expected)}
                      </span>
                      <strong>Difference {money(c.difference)}</strong>
                    </div>
                  ))}
              </section>
            )}
            <div className="insights-action-tabs" aria-label="Management tools">
              <button onClick={()=>setModal("delivery-services")}><Send size={16}/><strong>Online delivery services</strong></button>
              {data.user.role === "owner" && <button onClick={()=>{setPantryStart("payroll");setView("Inventory");}}><Users size={16}/><strong>Staff salary accounts</strong></button>}
              <button onClick={()=>setModal("customers")}><Users size={16}/><strong>Customer contacts</strong></button>
              {data.user.role === "owner" && data.pantry?.caEnabled && <button onClick={()=>{setPantryStart("ca");setView("Inventory");}}><ReceiptText size={16}/><strong>CA reports</strong></button>}
            </div>
          </main>
        )}
        {view === "Menu" && manager && (
          <main className="page-content">
            <PageTitle
              eyebrow="YOUR MENU, YOUR WAY"
              title="Made to order."
              description="Prices, customisations, recipes and availability in one place."
              action={
                <button
                  className="primary compact"
                  onClick={() => {
                    setProductEdit({
                      id: uid(),
                      name: "",
                      price: 10000,
                      category: "Coffee",
                      station: "Barista",
                      available: true,
                      taxBps: 500,
                      variants: { Regular: 0 },
                      addons: {},
                      recipe: {},
                      image: "",
                      emoji: "☕",
                      description: "",
                    });
                    setModal("product");
                  }}
                >
                  <Plus size={17} /> New product
                </button>
              }
            />
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Tax</th>
                    <th>Station</th>
                    <th>Availability</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>
                          {p.emoji} {p.name}
                        </strong>
                        <small>{p.description}</small>
                      </td>
                      <td>{p.category}</td>
                      <td>{money(p.price)}</td>
                      <td>{p.taxBps / 100}%</td>
                      <td>{p.station}</td>
                      <td>
                        <button
                          className={`status ${p.available ? "paid" : "cancelled"}`}
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await api("saveProduct", {
                                ...p,
                                available: !p.available,
                              });
                              await refresh();
                            })
                          }
                        >
                          {p.available ? "Available" : "Unavailable"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="subtle"
                          onClick={() => {
                            setProductEdit({ ...p });
                            setModal("product");
                          }}
                        >
                          Edit <Settings2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        )}
        {view === "Staff" && (
          <main className="page-content">
            <PageTitle
              eyebrow="THE PEOPLE BEHIND THE GOOD DAYS"
              title="Your workspace"
              description="A clear role for every member of the team."
            />
            {manager && <DeliveryServices config={data.deliveryServices} busy={busy} onChange={payload=>perform(async()=>{await api("deliveryService",payload); await refresh();})} />}
            <div className="insight-grid">
              <section className="panel">
                <div className="account-profile">
                  <div className="avatar">
                    {data.user.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")}
                  </div>
                  <div>
                    <h2>{data.user.name}</h2>
                    <span className="pill">{data.user.role}</span>
                  </div>
                </div>
                <p className="muted">
                  {manager
                    ? "Menu, stock, billing and operational controls."
                    : barista
                      ? "Preparation queue and kitchen status updates."
                      : "Orders, kitchen tickets and payment recording."}
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    setPassword("");
                    setNote("");
                    setModal("password");
                  }}
                >
                  Change password
                </button>
                <button
                  className="subtle"
                  onClick={() =>
                    perform(async () => {
                      await fetch("/api/logout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: "{}",
                      });
                      hydrated.current = "";
                      localStorage.removeItem("cafeos-last-user");
                      setData(null);
                      setDraft(null);
                      setView("POS");
                    })
                  }
                >
                  <LogOut size={16} /> End shift & sign out
                </button>
              </section>
              <section className="panel">
                <h2>A little clarity</h2>
                <p className="muted">
                  This local edition runs one café outlet. Payment collection
                  happens on your external UPI or card terminal. CaféOS records
                  staff confirmation.
                </p>
                <p className="muted">
                  Offline mode keeps order drafts on this browser. Checkout,
                  kitchen changes and stock updates require a connection to this
                  server.
                </p>
                <button
                  className="subtle"
                  onClick={() => window.open("/docs", "_blank")}
                >
                  Read setup & limitations <ArrowUpRight size={15} />
                </button>
              </section>
              {data.user.role === "owner" && (
                <section className="panel">
                  <h2>Outlet settings</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      perform(async () => {
                        await api("settings", {
                          outlet: String(f.get("outlet")),
                          taxLabel: String(f.get("taxLabel")),
                          loyaltyEvery: Math.round(
                            Number(f.get("loyalty")) * 100,
                          ),
                        });
                        await refresh();
                        notify("Settings updated");
                      });
                    }}
                  >
                    <label>
                      Outlet name
                      <input
                        name="outlet"
                        defaultValue={data.settings.outlet}
                        required
                      />
                    </label>
                    <label>
                      Tax label
                      <input
                        name="taxLabel"
                        defaultValue={data.settings.taxLabel}
                        required
                      />
                    </label>
                    <label>
                      Spend per loyalty point (₹)
                      <input
                        name="loyalty"
                        type="number"
                        min="1"
                        defaultValue={data.settings.loyaltyEvery / 100}
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Save settings <Check size={16} />
                    </button>
                  </form>
                </section>
              )}
              {data.user.role === "owner" && (
                <section className="panel">
                  <h2>Payment QR</h2>
                  <PaymentQRSetup
                    qr={data.paymentQR ?? null}
                    busy={busy || !online}
                    onSave={(value) =>
                      perform(async () => {
                        await api("savePaymentQR", value);
                        await refresh();
                        notify("Merchant payment QR saved");
                      })
                    }
                  />
                </section>
              )}
              {manager && (
                <section className="panel">
                  <h2>Returning customers</h2>
                  {data.customers.length ? (
                    data.customers.map((c) => (
                      <div key={c.id} className="report-row">
                        <span>
                          {c.name}
                          <small>
                            {c.visits} visits{c.phone && ` / ${c.phone}`}
                            {c.email && ` / ${c.email}`} /{" "}
                            {c.marketingConsent
                              ? "Marketing opted in"
                              : "No marketing opt-in"}
                          </small>
                        </span>
                        <strong>{c.points} points</strong>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Add an optional customer name at billing to start
                      collecting points.
                    </p>
                  )}
                  <small className="muted">
                    Points tracking only; reward redemption is not enabled.
                  </small>
                </section>
              )}
            </div>
            {manager && (
              <section className="panel">
                <h2>Activity trail</h2>
                <div className="audit-list">
                  {data.audit.map((a) => (
                    <div key={a.id}>
                      <span>
                        {new Date(a.createdAt).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div>
                        <strong>
                          {a.actor} · {a.action}
                        </strong>
                        <p>{a.detail}</p>
                      </div>
                    </div>
                  ))}
                  {!data.audit.length && (
                    <p className="muted">
                      Your café activity will appear here.
                    </p>
                  )}
                </div>
              </section>
            )}
          </main>
        )}
      </div>
      {view === "POS" && draft && draft.lines.length > 0 && (
        <button
          className="mobile-cart-bar"
          onClick={() =>
            document.getElementById("current-order")?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "instant"
                : "smooth",
            })
          }
        >
          <span>
            {draft.lines.reduce((s, l) => s + l.qty, 0)} items ·{" "}
            {money(sum.total)}
          </span>
          <strong>
            View order <ArrowRight size={16} />
          </strong>
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "customers" ? "Customer contacts" : modal === "delivery-services" ? "Online delivery services" : modal === "offer"
              ? "Today’s offer banner"
              : modal === "notices"
                ? "The team board"
                : modal === "theme"
                  ? "Set the team’s mood"
                  : modal === "modifiers"
                    ? selected?.name || "Customise"
                    : modal === "payment"
                      ? "A good order, all settled."
                      : modal === "receipt"
                        ? "Your receipt"
                        : modal === "discount"
                          ? "A little on the house."
                          : modal === "product"
                            ? "Craft your menu"
                            : modal === "stock"
                              ? "Keep the pantry ready"
                              : modal === "closing"
                                ? "Call it a good day."
                                : modal === "refund"
                                  ? "Record a full refund"
                                  : modal === "cancel"
                                    ? "Cancel this order"
                                    : "Change your password"
          }
          onClose={closeModal}
          wide={
            modal === "customers" ||
            modal === "product" ||
            modal === "theme" ||
            modal === "notices" ||
            modal === "payment" ||
            modal === "offer"
          }
        >
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {modal === "delivery-services" && manager && <DeliveryServices config={data.deliveryServices} busy={busy} onChange={payload=>perform(async()=>{await api("deliveryService",payload);await refresh();})}/>}
          {modal === "customers" && manager && <CustomerContacts customers={data.customers} online={online}/>}
          {modal === "offer" && data.user.role === "owner" && (
            <OfferEditor
              offer={data.offerEditor ?? null}
              busy={busy}
              online={online}
              onSave={(payload) =>
                perform(async () => {
                  await api("saveOffer", payload);
                  await refresh();
                  setModal("");
                  notify(
                    "Offer banner saved. It will appear during the selected dates.",
                  );
                })
              }
              onHide={() =>
                perform(async () => {
                  await api("hideOffer", {
                    version: data.offerEditor?.version,
                  });
                  await refresh();
                  setModal("");
                  notify("Offer banner hidden. Your uploaded image is kept.");
                })
              }
            />
          )}
          {modal === "notices" && (
            <NoticeBoard
              notices={data.notices ?? []}
              user={data.user}
              busy={busy}
              online={online}
              onSave={async (payload) => {
                let success = false;
                await perform(async () => {
                  await api("saveNotice", payload);
                  await refresh();
                  success = true;
                  notify("Team notice posted.");
                });
                return success;
              }}
              onArchive={(notice) =>
                perform(async () => {
                  await api("archiveNotice", {
                    id: notice.id,
                    version: notice.version,
                  });
                  await refresh();
                  notify("Team notice archived.");
                })
              }
            />
          )}
          {modal === "theme" && data.user.role === "owner" && (
            <ThemePicker
              value={themePreview ?? data.settings.theme ?? "garden"}
              saved={data.settings.theme ?? "garden"}
              onChange={setThemePreview}
              onCancel={closeModal}
              busy={busy}
              onSave={() =>
                perform(async () => {
                  await api("setTheme", { theme: themePreview ?? "garden" });
                  await refresh();
                  setThemePreview(null);
                  setModal("");
                  notify("Team theme saved. A fresh mood for the whole café.");
                })
              }
            />
          )}
          {modal === "modifiers" && selected && (
            <>
              <p className="muted">
                Defaults are already selected. Make it their own.
              </p>
              {!!Object.keys(selected.variants).length && (
                <fieldset>
                  <legend>Size</legend>
                  <div className="option-row">
                    {Object.entries(selected.variants).map(([v, price]) => (
                      <button
                        key={v}
                        className={size === v ? "option selected" : "option"}
                        onClick={() => setSize(v)}
                      >
                        {v}
                        <small>{price ? "+" + money(price) : "Included"}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {!!Object.keys(selected.addons).length && (
                <fieldset>
                  <legend>Something extra?</legend>
                  {Object.entries(selected.addons).map(([a, price]) => (
                    <label className="check-row" key={a}>
                      <input
                        type="checkbox"
                        checked={addons.includes(a)}
                        onChange={() =>
                          setAddons(
                            addons.includes(a)
                              ? addons.filter((x) => x !== a)
                              : [...addons, a],
                          )
                        }
                      />
                      <span>{a}</span>
                      <strong>+{money(price)}</strong>
                    </label>
                  ))}
                </fieldset>
              )}
              <label>
                Preparation note
                <textarea
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Less sugar, extra hot…"
                />
              </label>
              <button className="primary" onClick={applyModifiers}>
                Save customisation <Check size={17} />
              </button>
            </>
          )}
          {modal === "discount" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const bps = Math.round(Number(discount) * 100);
                if (!Number.isFinite(bps) || bps < 0 || bps > 5000) {
                  setError("Enter a discount between 0% and 50%");
                  return;
                }
                setDraft({ ...draft!, discountBps: bps });
                setModal("");
              }}
            >
              <p className="muted">
                Owner or manager authorisation is checked when the order is
                saved.
              </p>
              <label>
                Discount percentage
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  required
                />
              </label>
              <button className="primary">
                Apply discount <Check size={17} />
              </button>
            </form>
          )}
          {modal === "payment" && (
            <>
              <div className="payment-total">
                <span>Total payable</span>
                <strong>{money(sum.total)}</strong>
                <small>Cash, UPI QR or card · INR</small>
              </div>
              <div className="option-row">
                {(["cash", "upi", "card"] as const).map((m) => (
                  <button
                    key={m}
                    className={method === m ? "option selected" : "option"}
                    onClick={() => {
                      setMethod(m);
                      setReference("");
                      setConfirmed(false);
                    }}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
              {payments.map((p, i) => (
                <div className="report-row" key={i}>
                  <span>
                    {p.method.toUpperCase()} {money(p.amount)}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Remove payment part"
                    onClick={() => {
                      const next = payments.filter((_, j) => i !== j);
                      setPayments(next);
                      setPayAmount(
                        (
                          (sum.total - next.reduce((s, p) => s + p.amount, 0)) /
                          100
                        ).toFixed(2),
                      );
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <label>
                {payments.length ? "Remaining amount (₹)" : "Amount (₹)"}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => {
                    setPayAmount(e.target.value);
                    setConfirmed(false);
                    setReference("");
                  }}
                />
              </label>
              {method === "cash" && (
                <section
                  className="cash-tender"
                  aria-label="Cash tender and change"
                >
                  <h3>Cash denominations</h3>
                  <p className="muted">Tap to add notes or coins received.</p>
                  <div className="denominations">
                    {[5, 10, 20, 50, 100, 200, 500].map((n) => (
                      <button
                        key={n}
                        onClick={() =>
                          setCashTendered(
                            (
                              (Math.round(Number(cashTendered || 0) * 100) +
                                n * 100) /
                              100
                            ).toFixed(2),
                          )
                        }
                      >
                        + &#8377;{n}
                      </button>
                    ))}
                  </div>
                  <label>
                    Cash tendered (&#8377;)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashTendered}
                      placeholder={payAmount}
                      onChange={(e) => setCashTendered(e.target.value)}
                    />
                  </label>
                  <div className="cash-summary">
                    <span>Cash payment</span>
                    <strong>
                      {money(Math.round(Number(payAmount || 0) * 100))}
                    </strong>
                    <span>Return change</span>
                    <strong>
                      {money(
                        Math.max(
                          0,
                          Math.round(
                            (Number(cashTendered || payAmount) -
                              Number(payAmount)) *
                              100,
                          ),
                        ),
                      )}
                    </strong>
                  </div>
                  {cashTendered !== "" &&
                    Number(cashTendered) < Number(payAmount) && (
                      <p className="error">
                        Cash received is short by{" "}
                        {money(
                          Math.round(
                            (Number(payAmount) - Number(cashTendered)) * 100,
                          ),
                        )}
                        .
                      </p>
                    )}
                  <button
                    className="subtle"
                    onClick={() => setCashTendered(payAmount)}
                  >
                    Exact amount
                  </button>
                  <button
                    className="subtle"
                    onClick={() => setCashTendered("")}
                  >
                    Reset tender
                  </button>
                </section>
              )}
              {method === "upi" && Number(payAmount) > 0 && (
                <ScanToPay
                  qr={data.paymentQR ?? null}
                  amount={Math.round(Number(payAmount) * 100)}
                />
              )}
              <label>Customer name · optional
                <input aria-label="Customer name" maxLength={300} placeholder="Enter customer name" value={draft?.customer ?? ""} onChange={e => setDraft({ ...draft!, customer: e.target.value })} />
              </label>
              <CustomerContact
                value={draft?.contact}
                onChange={(contact) => setDraft({ ...draft!, contact })}
              />
              {method !== "cash" && Number(payAmount) > 0 && (
                <>
                  <label>
                    External payment reference
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="UPI transaction ID or terminal receipt"
                      maxLength={100}
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>I verified this payment on the bank / terminal.</span>
                  </label>
                  <p className="notice small">
                    CaféOS does not collect or electronically verify this
                    payment.
                  </p>
                </>
              )}
              <button
                className="subtle"
                onClick={addPayment}
                disabled={Number(payAmount) <= 0}
              >
                <Plus size={15} /> Add this part & split payment
              </button>
              <button
                className="primary"
                disabled={busy || !online}
                onClick={() => perform(checkout)}
              >
                Record payment & finish <Check size={18} />
              </button>
              <small className="muted">
                Any unsent items will be sent to their preparation stations.
              </small>
            </>
          )}
          {modal === "receipt" && receipt && (
            <>
              <div className="receipt">
                <Coffee size={27} />
                <h3>{data.settings.outlet}</h3>
                <p>
                  {receipt.invoice || "Bill"}
                  <br />Order #{receipt.number}
                  <br />Bill date & time: {new Date(receipt.paidAt || receipt.createdAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})}
                  <br />
                  {orderServiceLabel(receipt)}
                </p>
                {receipt.customer && <p>Customer: {receipt.customer}</p>}
                <hr />
                {receipt.lines.map((l) => (
                  <div className="receipt-line" key={l.id}>
                    <span>
                      {l.qty}× {l.name}
                      <small>
                        {l.size} {l.addons.join(", ")}
                      </small>
                    </span>
                    <strong>{money(l.price * l.qty)}</strong>
                  </div>
                ))}
                <hr />
                <div className="report-row">
                  <span>Subtotal</span>
                  <span>{money(receipt.subtotal)}</span>
                </div>
                <div className="report-row">
                  <span>Discount</span>
                  <span>−{money(receipt.discount)}</span>
                </div>
                <div className="report-row">
                  <span>Tax</span>
                  <span>{money(receipt.tax)}</span>
                </div>
                <div className="report-row">
                  <b>Total</b>
                  <b>{money(receipt.total)}</b>
                </div>
                {receipt.payments.map((p, i) => (
                  <small key={i}>
                    {p.method.toUpperCase()} · {money(p.amount)}{" "}
                    {p.reference && `· ${p.reference}`}
                    {p.tendered !== undefined &&
                      ` / Tendered ${money(p.tendered)} / Change ${money(p.change || 0)}`}
                    <br />
                  </small>
                ))}
                {receipt.refund > 0 && (
                  <p>REFUNDED · {money(receipt.refund)}</p>
                )}
                <hr />
                <p>
                  Good coffee. Better company.
                  <br />
                  Thank you for stopping by.
                </p>
                <small>
                  Demo tax configuration. Not validated as a GST invoice.
                </small>
              </div>
              <button className="primary" onClick={() => printBill()}><Printer size={17} /> Print bill</button>
              <div className="receipt-actions">
                <button className="secondary" onClick={closeModal}>Back to the good stuff <ArrowRight size={16} /></button>
                <button className="primary" onClick={() => printBill(true)}><Printer size={17} /> Print &amp; back to shop</button>
              </div>
            </>
          )}
          {modal === "product" && productEdit && (
            <ProductEditor
              product={productEdit}
              ingredients={data.ingredients}
              busy={busy}
              onSave={(p) =>
                perform(async () => {
                  await api("saveProduct", p);
                  await refresh();
                  setModal("");
                  notify("Menu updated");
                })
              }
            />
          )}
          {modal === "stock" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  await api("adjustStock", {
                    id: stockId,
                    kind: stockKind,
                    amount: Number(stockAmount),
                    reason: stockReason,
                    date:stockDate,
                  });
                  await refresh();
                  setModal("");
                  notify("Stock updated");
                });
              }}
            >
              <label>Entry date<input type="date" required max={indiaDay()} value={stockDate} onInput={e=>setStockDate(e.currentTarget.value)} onChange={e=>setStockDate(e.target.value)}/></label>
              <label>
                Ingredient
                <select
                  value={stockId}
                  onChange={(e) => setStockId(e.target.value)}
                >
                  {data.ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entry type
                <select
                  value={stockKind}
                  onChange={(e) => setStockKind(e.target.value)}
                >
                  <option>Adjustment</option>
                  <option>Wastage</option>
                </select>
              </label>
              <label>
                Quantity change (negative for wastage)
                <input
                  type="number"
                  required
                  step="0.001"
                  value={stockAmount}
                  onChange={(e) => setStockAmount(e.target.value)}
                />
              </label>
              <label>
                Reason / supplier reference
                <input
                  required
                  minLength={3}
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Record stock entry <Check size={17} />
              </button>
            </form>
          )}
          {modal === "closing" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  const closing = await api("closeDay", {
                    date: indiaDay(),
                    counted: Math.round(Number(closeCount) * 100),
                    note: closeNote,
                  });
                  await refresh();
                  setModal("");
                  notify(
                    `Closing saved · difference ${money(closing.difference)}`,
                  );
                });
              }}
            >
              <p className="muted">
                Cash expected after today’s sales and recorded cash outflows:{" "}
                <strong>
                  {money(
                    today
                      .filter((o) => o.status === "paid")
                      .flatMap((o) => o.payments)
                      .filter((p) => p.method === "cash")
                      .reduce((s, p) => s + p.amount, 0) - cashOutflowForDay(data.pantry ?? {purchases:[],expenses:[],payments:[]}, indiaDay()),
                  )}
                </strong>
                . Cash purchases, expenses and supplier payments are deducted. Opening float is excluded.
              </p>
              <label>
                Counted sales cash (₹)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={closeCount}
                  onChange={(e) => setCloseCount(e.target.value)}
                />
              </label>
              <label>
                Closing note
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  maxLength={300}
                />
              </label>
              <button className="primary" disabled={busy}>
                Save closing & discrepancy <Check size={17} />
              </button>
            </form>
          )}
          {(modal === "refund" || modal === "cancel") && targetOrder && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  await api(modal === "refund" ? "refund" : "cancelOrder", {
                    id: targetOrder.id,
                    version: targetOrder.version,
                    reason,
                    confirmed,
                  });
                  await refresh();
                  if (draft?.id === targetOrder.id) setDraft(blank());
                  setModal("");
                  notify(
                    modal === "refund"
                      ? "Full refund recorded"
                      : "Order cancelled",
                  );
                });
              }}
            >
              <p className="muted">
                Order #{targetOrder.number} · {money(targetOrder.total)}.
                Prepared ingredients are not automatically restocked.
              </p>
              <label>
                Reason
                <input
                  required
                  minLength={3}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {modal === "refund" && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I issued the full refund externally, including any split
                    payments.
                  </span>
                </label>
              )}
              <button className="primary danger" disabled={busy}>
                Record {modal === "refund" ? "refund" : "cancellation"}
              </button>
            </form>
          )}
          {modal === "password" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  await api("password", { current: password, password: note });
                  hydrated.current = "";
                  localStorage.removeItem("cafeos-last-user");
                  setData(null);
                  setDraft(null);
                  setModal("");
                  setPassword("");
                  notify("Password changed. Sign in again.");
                });
              }}
            >
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                New password (at least 10 characters)
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Change password & sign out
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading section-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Metric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function ProductEditor({
  product,
  ingredients,
  busy,
  onSave,
}: {
  product: Product;
  ingredients: AppData["ingredients"];
  busy: boolean;
  onSave: (p: Product) => void;
}) {
  const [p, setP] = useState(product),
    [variants, setVariants] = useState(JSON.stringify(p.variants)),
    [extras, setExtras] = useState(JSON.stringify(p.addons)),
    [recipe, setRecipe] = useState(JSON.stringify(p.recipe)),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave({
            ...p,
            variants: JSON.parse(variants),
            addons: JSON.parse(extras),
            recipe: JSON.parse(recipe),
          });
        } catch {
          setError(
            'Check the JSON fields. Use an object such as {"Regular":0,"Large":4000}.',
          );
        }
      }}
    >
      <div className="form-grid">
        <label>
          Product name
          <input
            required
            value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })}
          />
        </label>
        <label>
          Category
          <input
            required
            value={p.category}
            onChange={(e) => setP({ ...p, category: e.target.value })}
          />
        </label>
        <label>
          Base price (₹)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={p.price / 100}
            onChange={(e) =>
              setP({ ...p, price: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
        <label>
          Tax rate (%)
          <input
            type="number"
            required
            min="0"
            max="30"
            step="0.01"
            value={p.taxBps / 100}
            onChange={(e) =>
              setP({ ...p, taxBps: Math.round(Number(e.target.value) * 100) })
            }
          />
        </label>
        <label>
          Preparation station
          <select
            value={p.station}
            onChange={(e) => setP({ ...p, station: e.target.value })}
          >
            <option>Barista</option>
            <option>Kitchen</option>
            <option>Both</option>
          </select>
        </label>
        <label>
          Menu symbol
          <input
            value={p.emoji}
            maxLength={10}
            onChange={(e) => setP({ ...p, emoji: e.target.value })}
          />
        </label>
      </div>
      <label>
        Description
        <input
          maxLength={200}
          value={p.description}
          onChange={(e) => setP({ ...p, description: e.target.value })}
        />
      </label>
      <label>
        Product photo (PNG, JPEG, WebP · max 500 KB)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 500000) {
              setError("Choose an image smaller than 500 KB");
              return;
            }
            const r = new FileReader();
            r.onload = () => setP({ ...p, image: String(r.result) });
            r.readAsDataURL(f);
          }}
        />
      </label>
      <details>
        <summary>Advanced: variants, add-ons & recipe</summary>
        <p className="muted">
          Prices below use paise. Recipe quantities use ingredient units.
        </p>
        <label>
          Size price increments (JSON)
          <textarea
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
          />
        </label>
        <label>
          Add-on prices (JSON)
          <textarea
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
          />
        </label>
        <label>
          Recipe ingredient quantities (JSON)
          <textarea
            value={recipe}
            onChange={(e) => setRecipe(e.target.value)}
          />
        </label>
        <small className="muted">
          Ingredient IDs:{" "}
          {ingredients.map((i) => `${i.id} (${i.unit})`).join(", ")}. Large uses
          1.5× the recipe. Named Oat milk, Extra shot and Extra cheese use
          built-in recipe adjustments.
        </small>
      </details>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="primary" disabled={busy}>
        Save menu item <Check size={17} />
      </button>
    </form>
  );
}
