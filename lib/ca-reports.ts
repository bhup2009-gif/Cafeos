import { get, all } from "./db";
import { permit, DomainError } from "./auth";
import { indiaDay, type User, type Order, type AppData } from "./types";
import { pantrySnapshot } from "./pantry";
import { paymentLabels, type PantryData } from "./pantry-types";
import type { Report } from "./reports";
export const caReportKinds=["ca-transactions","ca-suppliers","ca-payroll","ca-stock"];
export function caReport(user:User,kind:string,from?:string,to?:string):Report {
  permit(user,["owner"]);
  if(!get<{caEnabled:boolean}>("metadata","pantry-settings")?.caEnabled)throw new DomainError("CA reports are turned off. Enable them in Inventory.",403);
  const end=to || indiaDay(),start=from || `${end.slice(0,7)}-01`;
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(`${s}T00:00:00Z`))&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;
  if(!valid(start)||!valid(end)||start>end||end>indiaDay())throw new DomainError("Choose a valid report date range ending today or earlier");
  const p=pantrySnapshot(user),within=(d:string)=>d>=start&&d<=end;
  const supplier=(id:string)=>p.suppliers.find(s=>s.id===id)?.name||"";
  const base={outlet:get<AppData["settings"]>("metadata","settings")!.outlet,generatedAt:new Date().toISOString()};
  if(kind==="ca-transactions") {
    const rows:(string|number)[][]=[];
    for(const x of p.purchases.filter(x=>within(x.date)))rows.push([x.date,"Stock purchase",x.id,supplier(x.supplierId),x.billNumber,x.amount/100,x.paidAmount/100,(x.amount-x.paidAmount)/100,paymentLabels[x.paidFrom],x.notes,x.actor,x.createdAt]);
    for(const x of p.expenses.filter(x=>within(x.date)))rows.push([x.date,["Salary","Advance salary"].includes(x.reason)?"Salary / advance payment":"Operating expense",x.id,x.employee||supplier(x.supplierId),x.reason,["Salary","Advance salary"].includes(x.reason)?0:x.amount/100,x.paidAmount/100,(["Salary","Advance salary"].includes(x.reason)?-x.paidAmount:x.amount-x.paidAmount)/100,paymentLabels[x.paidFrom],x.explanation,x.actor,x.createdAt]);
    for(const x of p.payments.filter(x=>within(x.date)))rows.push([x.date,"Supplier settlement",x.id,supplier(x.supplierId),x.reference,0,x.amount/100,-x.amount/100,paymentLabels[x.paidFrom],x.notes,x.actor,x.createdAt]);
    for(const x of p.accruals.filter(x=>within(x.date)))rows.push([x.date,"Salary accrued (non-cash)",x.id,x.employee,x.month,x.amount/100,0,x.amount/100,"Non-cash",x.notes,x.actor,x.createdAt]);
    for(const x of all<Order>("orders").filter(x=>!!x.paidAt&&within(indiaDay(x.paidAt))))rows.push([indiaDay(x.paidAt!),x.refund?"Sale with refund":"Sale",x.id,x.customer||"Walk-in",x.invoice||"",(x.total-x.refund)/100,(x.total-x.refund)/100,0,x.payments.map(p=>p.method).join(" + "),`Sales inflow. Demo tax ${x.tax/100}; refund ${x.refund/100}.`,"",x.paidAt!]);
    return {...base,title:`CA transaction register · ${start} to ${end}`,headers:["Entry date","Classification","Cash direction","Entry ID","Supplier / employee / customer","Bill / reason / reference","Booked amount (INR)","Paid / received (INR)","Payable change (INR)","Account / method","Explanation","Recorded by","Recorded at (UTC)"],rows:rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(r=>[r[0],r[1],String(r[1]).startsWith("Sale")?"In":String(r[1]).includes("non-cash")?"Non-cash":"Out",...r.slice(2)])};
  }
  if(kind==="ca-suppliers") return {...base,title:`Supplier balances as of ${end}`,headers:["Supplier","Phone","Opening payable (INR)","Purchases (INR)","Supplier expenses (INR)","Payments incl. paid-at-entry (INR)","Outstanding (INR)"],rows:p.suppliers.filter(s=>indiaDay(s.createdAt)<=end || p.purchases.some(x=>x.supplierId===s.id&&x.date<=end) || p.expenses.some(x=>x.supplierId===s.id&&x.date<=end) || p.payments.some(x=>x.supplierId===s.id&&x.date<=end)).map(s=>{
    const purchases=p.purchases.filter(x=>x.supplierId===s.id&&x.date<=end),expenses=p.expenses.filter(x=>x.supplierId===s.id&&x.date<=end),payments=p.payments.filter(x=>x.supplierId===s.id&&x.date<=end);
    const a=purchases.reduce((n,x)=>n+x.amount,0),b=expenses.reduce((n,x)=>n+x.amount,0),paid=purchases.reduce((n,x)=>n+x.paidAmount,0)+expenses.reduce((n,x)=>n+x.paidAmount,0)+payments.reduce((n,x)=>n+x.amount,0);
    const opening=indiaDay(s.createdAt)<=end?s.openingBalance:0;
    return [s.name,s.phone,opening/100,a/100,b/100,paid/100,(opening+a+b-paid)/100];
  })};
  if(kind==="ca-stock")return {...base,title:`Stock receipts and manual changes · ${start} to ${end}`,headers:["Entry date","Type","Entry ID","Supplier","Bill / reason","Ingredient","Unit","Quantity change","Line amount (INR; blank for counts)","Recorded at (UTC)"],rows:[
    ...p.purchases.filter(x=>within(x.date)).flatMap(x=>x.lines.map(l=>[x.date,"Purchase",x.id,supplier(x.supplierId),x.billNumber,l.name,l.unit,l.quantity,l.amount/100,x.createdAt])),
    ...p.stockChanges.filter(x=>within(x.date)).map(x=>[x.date,`Manual ${x.kind}`,x.id,"",x.reason,x.name,x.unit,x.quantity,"",x.createdAt]),
  ].sort((a,b)=>String(a[0]).localeCompare(String(b[0])))};
  if(kind==="ca-payroll") {
    const rows:(string|number)[][]=[];
    for(const x of p.accruals.filter(x=>within(x.date)))rows.push([x.date,x.employee,"Salary due",x.month,x.amount/100,0,"Non-cash",x.notes,x.createdAt]);
    for(const x of p.expenses.filter(x=>within(x.date)&&["Salary","Advance salary"].includes(x.reason)))rows.push([x.date,x.employee,x.reason,"",0,x.paidAmount/100,paymentLabels[x.paidFrom],x.explanation,x.createdAt]);
    for(const e of p.staff){const due=p.accruals.filter(a=>a.employeeId===e.id&&a.date<=end).reduce((s,a)=>s+a.amount,0),paid=p.expenses.filter(a=>a.employeeId===e.id&&a.date<=end&&["Salary","Advance salary"].includes(a.reason)).reduce((s,a)=>s+a.paidAmount,0);if(due||paid)rows.push([end,e.name,"Balance as of report end (negative = advance)","",(due-paid)/100,0,"Memo","Not an additional salary expense",""]);}
    return {...base,title:`Salary register · ${start} to ${end}`,headers:["Entry date","Employee","Type","Salary month","Accrued / balance (INR)","Paid (INR)","Account","Notes","Recorded at (UTC)"],rows};
  }
  throw new DomainError("Unknown CA report");
}
