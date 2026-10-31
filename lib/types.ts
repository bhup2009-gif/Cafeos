import type { ThemeId } from "./themes";
export type Role = "owner" | "manager" | "cashier" | "barista";
export type User = { id: string; name: string; role: Role };
export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  station: string;
  available: boolean;
  taxBps: number;
  variants: Record<string, number>;
  addons: Record<string, number>;
  recipe: Record<string, number>;
  image: string;
  emoji: string;
  description: string;
};
export type ItemPriority = "first" | "normal" | "later";
export type Line = {
  priority?: ItemPriority;
  id: string;
  productId: string;
  name: string;
  qty: number;
  size: string;
  addons: string[];
  note: string;
  price: number;
  taxBps: number;
  station: string;
  recipe: Record<string, number>;
  sentQty: number;
};
export type Payment = {
  method: "cash" | "upi" | "card";
  amount: number;
  reference?: string;
  confirmed?: boolean;
  tendered?: number;
  change?: number;
};
export type Order = {
  id: string;
  number: number;
  mode: string;
  deliveryServiceId?: string;
  deliveryServiceName?: string;
  tableNo: number | null;
  customer: string;
  contact?: { phone: string; email: string; marketingConsent: boolean };
  customerId?: string;
  status: string;
  version: number;
  lines: Line[];
  discountBps: number;
  createdAt: string;
  paidAt: string | null;
  invoice: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: Payment[];
  refund: number;
  loyaltyEarned: number;
};
export type Ticket = {
  serviceLabel?: string;
  customer?: string;
  estimatedMinutes?: number;
  readyAt?: string;
  cancellationReason?: string;
  id: string;
  orderId: string;
  orderNumber: number;
  station: string;
  status: string;
  lines: {
    lineId?: string;
    priority?: ItemPriority;
    status?: string;
    estimatedMinutes?: number;
    readyAt?: string;
    cancellationReason?: string;
    name: string;
    qty: number;
    size: string;
    addons: string[];
    note: string;
  }[];
  createdAt: string;
  updatedAt: string;
};
export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  low: number;
  cost: number;
};
export type MessageAuthor = {
  id: string;
  name: string;
  role: "owner" | "manager";
};
export type OfferRecord = {
  title: string;
  image: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  version: number;
  author: MessageAuthor;
  updatedAt: string;
};
export type OfferBanner = Omit<OfferRecord, "image"> & { imageUrl: string };
export type TeamNotice = {
  id: string;
  message: string;
  priority: "normal" | "important";
  expiresOn: string | null;
  version: number;
  author: MessageAuthor;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};
export type AppData = {
  pantry: import("./pantry-types").PantryData;
  subscription?: import("./subscription").Subscription;
  user: User;
  offer: OfferBanner | null;
  offerEditor: OfferBanner | null;
  notices: TeamNotice[];
  paymentQR: {
    label: string;
    upiId: string;
    version: number;
    imageUrl: string;
  } | null;
  products: Product[];
  orders: Order[];
  tickets: Ticket[];
  deliveryServices: { version: number; services: { id: string; name: string; active: boolean }[] };
  ingredients: Ingredient[];
  customers: {
    id: string;
    name: string;
    points: number;
    visits: number;
    phone?: string;
    email?: string;
    marketingConsent?: boolean;
    consentAt?: string | null;
  }[];
  audit: {
    id: string;
    actor: string;
    action: string;
    detail: string;
    createdAt: string;
  }[];
  closings: {
    id: string;
    date: string;
    expected: number;
    counted: number;
    difference: number;
    createdAt: string;
  }[];
  settings: {
    theme?: ThemeId;
    taxLabel: string;
    loyaltyEvery: number;
    outlet: string;
  };
};
export const money = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: v % 100 === 0 ? 0 : 2,
  }).format(v / 100);
export const indiaDay = (v: string | Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(v));

export function orderServiceLabel(o: {mode: string; tableNo?: number | null; deliveryServiceName?: string}) {
  if (o.mode === "Dine-in") return `Dine-in${o.tableNo ? ` · Table ${String(o.tableNo).padStart(2, "0")}` : ""}`;
  if (o.mode === "Online delivery") return `Delivery · ${o.deliveryServiceName || "Online"}`;
  return o.mode === "Delivery pickup" ? "Pickup" : o.mode;
}
