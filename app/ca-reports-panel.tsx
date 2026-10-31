"use client";
import { useState } from "react";
import { indiaDay } from "@/lib/types";
export default function CAReportsPanel({online}:{online:boolean}) {
  const [from,setFrom]=useState(`${indiaDay().slice(0,7)}-01`),[to,setTo]=useState(indiaDay());
  const valid=!!from&&!!to&&from<=to&&to<=indiaDay();
  const range=`from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return <>
    <div className="panel"><h2>Reports for your CA</h2><p className="muted">Working records for accountant review: separate transactions, supplier balances, salary accounts and stock receipts. Purchases are not repeated as expenses; supplier settlements and salary payments are identified separately from costs booked. Sales tax remains the app’s demo configuration.</p><div className="pantry-form-grid"><label>From<input type="date" required max={to} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" required min={from} max={indiaDay()} value={to} onChange={e=>setTo(e.target.value)}/></label></div>{!valid&&<p className="error">Choose a valid date range.</p>}</div>
    <div className="pantry-card-grid">{[
      ["ca-transactions","Transaction register","Sales, purchases, operating expenses, salary accruals and payments, with entry date and recorded time."],
      ["ca-suppliers","Supplier balances","Opening payable, purchases, supplier expenses, payments and outstanding as of the To date."],
      ["ca-payroll","Salary register","Salary due by month, salary payments, advances and balance as of the To date."],
      ["ca-stock","Stock receipts","Ingredient receipts and manual adjustments/wastage with dates, references and purchase amounts."],
    ].map(([kind,label,description])=><section className="panel" key={kind}><h2>{label}</h2><p className="muted">{description}</p><div className="ca-export-links"><a aria-disabled={!online||!valid} href={online&&valid?`/api/export?kind=${kind}&format=xlsx&${range}`:undefined}>Excel</a><a aria-disabled={!online||!valid} href={online&&valid?`/api/export?kind=${kind}&format=csv&${range}`:undefined}>CSV</a><a aria-disabled={!online||!valid} href={online&&valid?`/reports/${kind}?${range}`:undefined} target="_blank" rel="noreferrer">Print / PDF</a></div></section>)}</div>
  </>;
}
