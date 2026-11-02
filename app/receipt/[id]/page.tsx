import {outletRequest} from "@/lib/cloud/access";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { authenticate } from "@/lib/auth";
import { get } from "@/lib/db";
import { orderServiceLabel, money, type Order, type AppData } from "@/lib/types";
import Print from "./print";
export const dynamic = "force-dynamic";
export default async function Receipt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const h=await headers();
  const request=new Request("http://localhost",{headers:{cookie:h.get("cookie")||""}});
  try {return await outletRequest(request,false,async()=>{
  const user=authenticate(request);
  if(user.role === "barista") throw Error("Access denied");
  const { id } = await params;
  const o = get<Order>("orders", id);
  if (!o) notFound();
  const settings = get<AppData["settings"]>("metadata", "settings")!;
  return (
    <main className="print-page">
      <div className="receipt">
        <h1>{settings.outlet}</h1>
        <p>
          {o.invoice || "Bill"}
          <br />Order #{o.number}
          <br />
          {orderServiceLabel(o)}
          <br />
          Bill date & time: {new Date(o.paidAt || o.createdAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}
        </p>
        {o.customer && <p>Customer: {o.customer}</p>}
        <hr />
        {o.lines.map((l) => (
          <div className="receipt-line" key={l.id}>
            <span>
              {l.qty}× {l.name}
              <small>
                {l.size} {l.addons.join(", ")}
              </small>
            </span>
            <strong>{money(l.qty * l.price)}</strong>
          </div>
        ))}
        <hr />
        {[
          ["Subtotal", o.subtotal],
          ["Discount", -o.discount],
          ["Tax", o.tax],
          ["Total", o.total],
        ].map(([label, value]) => (
          <div className="report-row" key={label}>
            <strong>{label}</strong>
            <strong>{money(Number(value))}</strong>
          </div>
        ))}
        {o.payments.map((p, i) => (
          <p key={i}>
            {p.method.toUpperCase()} · {money(p.amount)}{" "}
            {p.reference && `· ${p.reference}`}
            {p.tendered !== undefined &&
              ` / Tendered ${money(p.tendered)} / Change ${money(p.change || 0)}`}
          </p>
        ))}
        {o.refund > 0 && <p>REFUNDED: {money(o.refund)}</p>}
        <hr />
        <p>
          Good coffee. Better company.
          <br />
          Thank you for stopping by.
        </p>
        <small>Demo tax configuration. Not validated as a GST invoice.</small>
      </div>
      <Print />
    </main>
  );
  });}catch {return <main className="print-page"><h1>Sign in with an active subscription to view receipts.</h1><a href="/">Open CaféOS</a></main>;}
}
