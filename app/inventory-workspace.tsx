"use client";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Package, ShoppingBag, ReceiptText, Users, Wallet, Plus, X } from "lucide-react";
import SalaryAccounts from "./salary-accounts";
import ExpenseCalendar from "./expense-calendar";
import CAReportsPanel from "./ca-reports-panel";
import { indiaDay, money, type AppData } from "@/lib/types";
import { expenseReasons, paymentLabels, supplierBalance, type PaidFrom, type Supplier } from "@/lib/pantry-types";
type Pane = "home" | "stock" | "purchases" | "expenses" | "suppliers" | "accounts" | "payroll" | "ca";
type PurchaseLine = { key:string; ingredientId:string; quantity:string; amount:string };
type ExpenseRow = { key:string; reason:string; amount:string; explanation:string; employeeId:string; supplierId:string; paidAmount:string; paidFrom:PaidFrom; credit:boolean };
const uid = ():string => crypto.randomUUID();
const purchaseLine = ():PurchaseLine => ({key:uid(),ingredientId:"",quantity:"",amount:""});
const expenseRow = ():ExpenseRow => ({key:uid(),reason:"Other",amount:"",explanation:"",employeeId:"",supplierId:"",paidAmount:"0",paidFrom:"cash",credit:false});
function paise(v:string) { if (!/^\d+(\.\d{1,2})?$/.test(v.trim())) throw Error("Enter amounts in rupees with up to 2 decimals."); const [whole,dec=""] = v.trim().split("."); const n=Number(whole)*100+Number(dec.padEnd(2,"0")); if(!Number.isSafeInteger(n))throw Error("Amount is too large");return n; }
const previewAmount = (v:string) => {try{return paise(v);}catch{return 0;}};
const fieldAmount = (label:string,value:string,set:(v:string)=>void,required=true) => <label>{label}<input type="number" min="0" step="0.01" required={required} value={value} onChange={e=>set(e.target.value)} placeholder="0.00" /></label>;
export default function InventoryWorkspace({ data, busy, online, run, stock, initialPane="home" }: {
  data:AppData; busy:boolean; online:boolean; initialPane?:"home"|"payroll"|"ca";
  run:(action:string,payload:unknown,operationId:string)=>Promise<boolean>;
  stock:(openPurchases:()=>void)=>ReactNode;
}) {
  const [pane,setPane]=useState<Pane>(initialPane),[error,setError]=useState(""),[success,setSuccess]=useState("");
  const operation = useRef(uid());
  const supplierDraftId = useRef(uid());
  const [date,setDate]=useState(indiaDay()),[filter,setFilter]=useState("");
  const [supplierId,setSupplierId]=useState(""),[bill,setBill]=useState(""),[purchaseNotes,setPurchaseNotes]=useState(""),[purchaseLines,setPurchaseLines]=useState<PurchaseLine[]>([purchaseLine()]);
  const [credit,setCredit]=useState(false),[paid,setPaid]=useState("0"),[from,setFrom]=useState<PaidFrom>("cash");
  const [expenseRows,setExpenseRows]=useState<ExpenseRow[]>([expenseRow()]);
  const [editing,setEditing]=useState<Supplier|null>(null),[supplierName,setSupplierName]=useState(""),[phone,setPhone]=useState(""),[address,setAddress]=useState(""),[supplierNotes,setSupplierNotes]=useState(""),[opening,setOpening]=useState("0");
  const [account,setAccount]=useState(""),[paymentAmount,setPaymentAmount]=useState(""),[paymentFrom,setPaymentFrom]=useState<PaidFrom>("cash"),[reference,setReference]=useState(""),[paymentNote,setPaymentNote]=useState("");
  const p=data.pantry ?? {suppliers:[],purchases:[],expenses:[],payments:[],staff:[],stockChanges:[],profiles:[],accruals:[],caEnabled:false,caVersion:0};
  const disabled=busy||!online;
  const total=purchaseLines.reduce((sum,l)=>sum+previewAmount(l.amount),0);
  const outstanding=p.suppliers.reduce((sum,s)=>sum+supplierBalance(p,s.id),0);
  const name=(id:string)=>p.suppliers.find(s=>s.id===id)?.name || "—";
  function navigate(to:Pane) {setDate(indiaDay());setPane(to);setError("");setSuccess("");setFilter("");operation.current=uid();}
  async function submit(action:string,payload:()=>unknown,reset:()=>void) {
    setError("");setSuccess("");
    try {if(await run(action,payload(),operation.current)){operation.current=uid();reset();setSuccess("Entry saved.");}} catch(e){setError(e instanceof Error?e.message:"Could not save entry");}
  }
  const supplierSelect=(value:string,set:(v:string)=>void,required=false)=> <select aria-label="Supplier" required={required} value={value} onChange={e=>set(e.target.value)}><option value="">{required?"Choose supplier":"No supplier"}</option>{p.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  const fromSelect=(value:PaidFrom,set:(v:PaidFrom)=>void)=> <select aria-label="Paid from" value={value} onChange={e=>set(e.target.value as PaidFrom)}>{Object.entries(paymentLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>;
  const dateField=<label>Entry date<input type="date" required max={indiaDay()} value={date} onInput={e=>setDate(e.currentTarget.value)} onChange={e=>setDate(e.target.value)} /></label>;
  const patchExpense=(key:string,patch:Partial<ExpenseRow>)=>setExpenseRows(rows=>rows.map(r=>r.key===key?{...r,...patch}:r));
  const title={home:"The pantry",stock:"Stock & pantry",purchases:"Purchases",expenses:"Expenses",suppliers:"Suppliers",accounts:"Supplier accounts / Udhar",payroll:"Staff salary accounts",ca:"CA reports"}[pane];
  const historyFilter=<label className="pantry-filter">History date<input type="date" aria-label="Filter history by date" value={filter} onChange={e=>setFilter(e.target.value)} /><button type="button" className="subtle" onClick={()=>setFilter("")}>All dates</button></label>;
  function openAccount(id:string) {setAccount(id);setPaymentAmount("");setReference("");setPaymentNote("");operation.current=uid();}
  function editSupplier(s:Supplier|null) {supplierDraftId.current=s?.id??uid();setEditing(s);setSupplierName(s?.name??"");setPhone(s?.phone??"");setAddress(s?.address??"");setSupplierNotes(s?.notes??"");setOpening(String((s?.openingBalance??0)/100));operation.current=uid();}
  return <main className="page-content pantry-workspace">
    {pane!=="home" && <button type="button" className="subtle pantry-back" onClick={()=>navigate("home")}><ArrowLeft size={16}/> Back to inventory</button>}
    {pane!=="stock" && <div className="page-heading"><div><span className="eyebrow">A WELL-STOCKED KIND OF DAY</span><h1>{title}</h1><p>{pane==="home"?"Stock, purchases, daily expenses and supplier balances, together.":pane==="accounts"?"Track what you owe and record payments already made to suppliers.":"Record the details once. Keep a clear history."}</p></div></div>}
    {!online && <p className="notice">Reconnect to record purchases, expenses or payments.</p>}
    {error && <p className="error" role="alert">{error}</p>}{success&&<p className="pantry-success" role="status">{success}</p>}
    {pane==="home" && <>
      <div className="pantry-metrics"><div><span>Stock running low</span><strong>{data.ingredients.filter(i=>i.stock<i.low).length} items</strong></div><div><span>Expenses today</span><strong>{money(p.expenses.filter(e=>e.date===indiaDay()).reduce((s,e)=>s+e.amount,0))}</strong></div><div><span>Supplier outstanding</span><strong>{money(outstanding)}</strong></div></div>
      {data.user.role === "owner" && <div className="panel ca-settings-row"><div><h2>CA reports</h2><p className="muted">Optional accountant reports. Turning this off hides reports and blocks downloads; saved records stay available in their own sections.</p></div><button type="button" role="switch" aria-label="CA reports" aria-checked={p.caEnabled} className={`ca-toggle ${p.caEnabled?"enabled":""}`} disabled={disabled} onClick={()=>void submit("pantryCASettings",()=>({enabled:!p.caEnabled,version:p.caVersion}),()=>{})}>{p.caEnabled?"ON":"OFF"}</button></div>}
      <div className="pantry-card-grid">{([
        ["stock",Package,"Stock & pantry",`${data.ingredients.length} ingredients · stock health, adjustment and wastage`],
        ["purchases",ShoppingBag,"Purchases","Receive stock · purchase amount · paid, partial or udhar"],
        ["expenses",ReceiptText,"Expenses","Milk, salary, rent and other daily costs"],
        ["suppliers",Users,"Suppliers",`${p.suppliers.length} suppliers · names, contacts and opening balances`],
        ["accounts",Wallet,"Supplier accounts / Udhar","Outstanding balances, payment entries and account history"],
      ] as const).map(([key,Icon,label,description])=><button className="pantry-nav-card" key={key} onClick={()=>navigate(key)}><Icon size={26}/><h2>{label}</h2><p>{description}</p><span>Open <ArrowRight size={16}/></span></button>)}
        {data.user.role === "owner" && <button className="pantry-nav-card" onClick={()=>navigate("payroll")}><Users size={26}/><h2>Staff salary accounts</h2><p>Monthly salary, advances, payments and pending balances.</p><span>Open <ArrowRight size={16}/></span></button>}
        {data.user.role === "owner" && p.caEnabled && <button className="pantry-nav-card" onClick={()=>navigate("ca")}><ReceiptText size={26}/><h2>CA reports</h2><p>Date-wise transaction, supplier, salary and stock receipt exports.</p><span>Open <ArrowRight size={16}/></span></button>}
      </div>
    </>}
    {pane==="payroll" && data.user.role === "owner" && <SalaryAccounts data={p} busy={busy} online={online} run={run}/>}
    {pane==="ca" && data.user.role === "owner" && (p.caEnabled?<CAReportsPanel online={online}/>:<p className="notice">CA reports are off. Enable them on the Inventory home screen.</p>)}
    {pane==="stock" && <>{stock(()=>navigate("purchases"))}
      <section className="panel"><h2>Manual stock activity</h2><p className="muted">Date-wise adjustments and wastage recorded from this update. Purchase receipts are listed in Purchases.</p>{historyFilter}
        <div className="data-table"><table><thead><tr><th>Entry date</th><th>Ingredient</th><th>Type</th><th>Quantity change</th><th>Reason</th><th>Recorded by</th></tr></thead><tbody>{p.stockChanges.filter(x=>!filter||x.date===filter).map(x=><tr key={x.id}><td>{x.date}</td><td>{x.name}</td><td>{x.kind}</td><td>{x.quantity>0?"+":""}{x.quantity} {x.unit}</td><td>{x.reason}</td><td>{x.actor}</td></tr>)}</tbody></table>{!p.stockChanges.length&&<p className="pantry-empty">No manual stock entries recorded yet.</p>}</div>
      </section>
    </>}
    {pane==="purchases" && <>
      <form className="panel pantry-form" onSubmit={e=>{e.preventDefault();void submit("pantryPurchase",()=>({date,supplierId,billNumber:bill,notes:purchaseNotes,paidFrom:from,paidAmount:credit?paise(paid):total,lines:purchaseLines.map(l=>({ingredientId:l.ingredientId,quantity:Number(l.quantity),amount:paise(l.amount)}))}),()=>{setPurchaseLines([purchaseLine()]);setBill("");setPurchaseNotes("");setPaid("0");});}}>
        <h2>Record a purchase</h2><p className="muted">Stock increases when this purchase is saved. Use total line amounts, in rupees.</p>
        {!p.suppliers.length&&<p className="notice">Add a supplier first. <button type="button" className="subtle" onClick={()=>navigate("suppliers")}>Add supplier</button></p>}
        <div className="pantry-form-grid">{dateField}<label>Supplier{supplierSelect(supplierId,setSupplierId,true)}</label><label>Bill / invoice number<input maxLength={100} value={bill} onChange={e=>setBill(e.target.value)}/></label></div>
        <div className="data-table"><table><thead><tr><th>Ingredient</th><th>Quantity</th><th>Line amount (₹)</th><th>Action</th></tr></thead><tbody>{purchaseLines.map((l,index)=><tr key={l.key}><td><select aria-label={`Purchase ingredient ${index+1}`} required value={l.ingredientId} onChange={e=>setPurchaseLines(rows=>rows.map(r=>r.key===l.key?{...r,ingredientId:e.target.value}:r))}><option value="">Choose ingredient</option>{data.ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></td><td><input aria-label={`Purchase quantity ${index+1}`} type="number" min="0.001" max="1000000" step="0.001" required value={l.quantity} onChange={e=>setPurchaseLines(rows=>rows.map(r=>r.key===l.key?{...r,quantity:e.target.value}:r))}/></td><td><input aria-label={`Purchase amount ${index+1}`} type="number" min="0.01" step="0.01" required value={l.amount} onChange={e=>setPurchaseLines(rows=>rows.map(r=>r.key===l.key?{...r,amount:e.target.value}:r))}/></td><td><button type="button" className="icon-button" aria-label={`Remove purchase item ${index+1}`} disabled={purchaseLines.length===1} onClick={()=>setPurchaseLines(rows=>rows.filter(r=>r.key!==l.key))}><X size={16}/></button></td></tr>)}</tbody></table></div>
        <button type="button" className="subtle" disabled={purchaseLines.length>=50} onClick={()=>setPurchaseLines(rows=>[...rows,purchaseLine()])}><Plus size={16}/> Add item</button>
        <div className="pantry-payment-box"><strong>Total: {money(total)}</strong><label className="pantry-check"><input type="checkbox" checked={credit} onChange={e=>setCredit(e.target.checked)}/> Bought on credit / partially paid (udhar)</label><div className="pantry-form-grid">{credit&&fieldAmount("Paid now (₹)",paid,setPaid)}<label>Paid from{fromSelect(from,setFrom)}</label>{credit&&<p>Balance due: <strong>{money(Math.max(0,total-previewAmount(paid)))}</strong></p>}</div></div>
        <label>Notes<input maxLength={300} value={purchaseNotes} onChange={e=>setPurchaseNotes(e.target.value)}/></label><button className="primary" disabled={disabled||!p.suppliers.length}>Save purchase & receive stock</button>
      </form>
      <h2>Purchase history</h2>{historyFilter}<div className="data-table"><table><thead><tr><th>Date</th><th>Supplier / bill</th><th>Items</th><th>Total</th><th>Paid</th><th>Credit at purchase</th></tr></thead><tbody>{p.purchases.filter(x=>!filter||x.date===filter).map(x=><tr key={x.id}><td>{x.date}</td><td><strong>{name(x.supplierId)}</strong><small>{x.billNumber||"No bill number"}</small></td><td>{x.lines.map(l=><small key={l.ingredientId+l.name}>{l.name} · {l.quantity} {l.unit}</small>)}</td><td>{money(x.amount)}</td><td>{money(x.paidAmount)}<small>{paymentLabels[x.paidFrom]}</small></td><td>{money(x.amount-x.paidAmount)}</td></tr>)}</tbody></table>{!p.purchases.length&&<p className="pantry-empty">No purchases recorded yet.</p>}</div>
    </>}
    {pane==="expenses" && <>
      <ExpenseCalendar entries={p.expenses} date={date} onSelect={day=>{setDate(day);setFilter(day);}}/>
      <form className="panel pantry-form" onSubmit={e=>{e.preventDefault();void submit("pantryExpenses",()=>({entries:expenseRows.map(r=>({date,reason:r.reason,amount:paise(r.amount),explanation:r.explanation,employeeId:r.employeeId,supplierId:r.supplierId,paidAmount:r.credit?paise(r.paidAmount):paise(r.amount),paidFrom:r.paidFrom}))}),()=>setExpenseRows([expenseRow()]));}}>
        <h2>Add expenses</h2>{dateField}<p className="muted">Each row needs a reason and amount. Stock purchases belong in Purchases and are counted once.</p>
        <div className="data-table expense-entry-table"><table>
          <thead><tr><th>Reason</th><th>Amount (₹)</th><th>Explanation</th><th>Employee</th><th>Paid from</th><th>Action</th></tr></thead>
          <tbody>{expenseRows.map((r,index)=><Fragment key={r.key}>
            <tr>
              <td><select aria-label={`Expense reason ${index+1}`} value={r.reason} onChange={e=>patchExpense(r.key,{reason:e.target.value})}>{expenseReasons.filter(v=>data.user.role==="owner"||!["Salary","Advance salary"].includes(v)).map(v=><option key={v}>{v}</option>)}</select></td>
              <td><input aria-label={`Expense amount ${index+1}`} type="number" min="0.01" step="0.01" required value={r.amount} onChange={e=>patchExpense(r.key,{amount:e.target.value})}/></td>
              <td><input aria-label={`Expense explanation ${index+1}`} maxLength={300} value={r.explanation} onChange={e=>patchExpense(r.key,{explanation:e.target.value})} placeholder="What was it for?"/></td>
              <td><select aria-label={`Expense employee ${index+1}`} required={["Salary","Advance salary"].includes(r.reason)} value={r.employeeId} onChange={e=>patchExpense(r.key,{employeeId:e.target.value})}><option value="">No employee</option>{p.staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
              <td>{fromSelect(r.paidFrom,v=>patchExpense(r.key,{paidFrom:v}))}</td>
              <td><button type="button" className="subtle" onClick={()=>setExpenseRows(rows=>rows.length===1?[expenseRow()]:rows.filter(x=>x.key!==r.key))}>Clear</button></td>
            </tr>
            <tr className="expense-credit-row"><td colSpan={6}><div className="expense-credit-details">
              <label className="pantry-check"><input type="checkbox" checked={r.credit} onChange={e=>patchExpense(r.key,{credit:e.target.checked})}/> Udhar / partial</label>
              <label>Supplier {r.credit?"(required)":"(optional)"}{supplierSelect(r.supplierId,v=>patchExpense(r.key,{supplierId:v}),r.credit)}</label>
              {r.credit?<label>Paid now (₹)<input aria-label={`Expense paid now ${index+1}`} type="number" min="0" step="0.01" required value={r.paidAmount} onChange={e=>patchExpense(r.key,{paidAmount:e.target.value})}/></label>:<span>Paid in full</span>}
              {r.credit&&<span>Credit: {money(Math.max(0,previewAmount(r.amount)-previewAmount(r.paidAmount)))}</span>}
            </div></td></tr>
          </Fragment>)}</tbody>
        </table></div>
        <div className="pantry-inline"><button type="button" className="secondary" disabled={expenseRows.length>=30} onClick={()=>setExpenseRows(rows=>[...rows,expenseRow()])}><Plus size={16}/> Add expense row</button><button className="primary" disabled={disabled}>Save expenses</button></div>
      </form>
      <h2>Expense history</h2>{historyFilter}<div className="data-table"><table><thead><tr><th>Date</th><th>Reason / explanation</th><th>Employee</th><th>Supplier</th><th>Amount</th><th>Paid</th><th>Credit at entry</th></tr></thead><tbody>{p.expenses.filter(x=>!filter||x.date===filter).map(x=><tr key={x.id}><td>{x.date}</td><td><strong>{x.reason}</strong><small>{x.explanation}</small></td><td>{x.employee||"—"}</td><td>{name(x.supplierId)}</td><td>{money(x.amount)}</td><td>{money(x.paidAmount)}<small>{paymentLabels[x.paidFrom]}</small></td><td>{money(x.amount-x.paidAmount)}</td></tr>)}</tbody></table>{!p.expenses.length&&<p className="pantry-empty">No expenses recorded yet.</p>}</div>
    </>}
    {pane==="suppliers" && <>
      <form className="panel pantry-form" onSubmit={e=>{e.preventDefault();void submit("pantrySupplier",()=>({id:editing?.id??supplierDraftId.current,version:editing?.version??0,name:supplierName,phone,address,notes:supplierNotes,openingBalance:paise(opening)}),()=>editSupplier(null));}}>
        <h2>{editing?"Edit supplier":"Add supplier"}</h2><div className="pantry-form-grid"><label>Supplier name<input required minLength={2} maxLength={100} value={supplierName} onChange={e=>setSupplierName(e.target.value)}/></label><label>Phone<input type="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Opening amount owed (₹)<input type="number" min="0" step="0.01" required disabled={!!editing} value={opening} onChange={e=>setOpening(e.target.value)}/></label></div>
        {editing&&<p className="muted">Opening balance stays fixed after creation; use payment entries to reduce the balance.</p>}
        <label>Address<input maxLength={300} value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Notes<input maxLength={300} value={supplierNotes} onChange={e=>setSupplierNotes(e.target.value)}/></label><div className="pantry-inline"><button className="primary" disabled={disabled}>{editing?"Save supplier":"Add supplier"}</button>{editing&&<button type="button" className="secondary" onClick={()=>editSupplier(null)}>Cancel edit</button>}</div>
      </form>
      <div className="data-table"><table><thead><tr><th>Supplier</th><th>Phone / address</th><th>Opening balance</th><th>Outstanding</th><th>Actions</th></tr></thead><tbody>{p.suppliers.map(s=><tr key={s.id}><td><strong>{s.name}</strong><small>{s.notes}</small></td><td>{s.phone||"—"}<small>{s.address}</small></td><td>{money(s.openingBalance)}</td><td>{money(supplierBalance(p,s.id))}</td><td><button className="subtle" onClick={()=>editSupplier(s)}>Edit</button><button className="subtle" onClick={()=>{navigate("accounts");openAccount(s.id);}}>Open account <ArrowRight size={14}/></button></td></tr>)}</tbody></table>{!p.suppliers.length&&<p className="pantry-empty">Add your first supplier above.</p>}</div>
    </>}
    {pane==="accounts" && <>
      <div className="pantry-supplier-cards">{p.suppliers.map(s=><button className={`pantry-account-card ${account===s.id?"selected":""}`} key={s.id} onClick={()=>openAccount(s.id)}><span>{s.name}</span><strong>{money(supplierBalance(p,s.id))}</strong><small>Outstanding · open account</small></button>)}</div>
      {!p.suppliers.length&&<div className="panel"><p>Add a supplier to start an account.</p><button className="primary" onClick={()=>navigate("suppliers")}>Add supplier</button></div>}
      {account&&p.suppliers.some(s=>s.id===account)&&<>
        <div className="panel"><h2>{name(account)}</h2><p>Opening balance: {money(p.suppliers.find(s=>s.id===account)!.openingBalance)}</p><p className="pantry-balance">Outstanding: <strong>{money(supplierBalance(p,account))}</strong></p></div>
        <form className="panel pantry-form" onSubmit={e=>{e.preventDefault();void submit("pantryPayment",()=>({date,supplierId:account,amount:paise(paymentAmount),paidFrom:paymentFrom,reference,notes:paymentNote}),()=>{setPaymentAmount("");setReference("");setPaymentNote("");});}}>
          <h2>Record supplier payment</h2><p className="muted">Record a payment already made. This entry does not transfer money.</p><div className="pantry-form-grid">{dateField}{fieldAmount("Amount paid (₹)",paymentAmount,setPaymentAmount)}<label>Paid from{fromSelect(paymentFrom,setPaymentFrom)}</label></div><label>Payment reference<input required={paymentFrom!=="cash"} maxLength={100} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Bank / UPI / card reference"/></label><label>Notes<input maxLength={300} value={paymentNote} onChange={e=>setPaymentNote(e.target.value)}/></label><button className="primary" disabled={disabled||supplierBalance(p,account)<=0}>Record payment</button>
        </form>
        <h2>Account history</h2><div className="data-table"><table><thead><tr><th>Date</th><th>Entry</th><th>Details</th><th>Billed</th><th>Paid</th><th>Change in amount owed</th></tr></thead><tbody>{[
          ...p.purchases.filter(x=>x.supplierId===account).map(x=>({id:x.id,date:x.date,created:x.createdAt,type:"Purchase",details:x.billNumber||x.lines.map(l=>l.name).join(", "),amount:x.amount,paid:x.paidAmount,change:x.amount-x.paidAmount})),
          ...p.expenses.filter(x=>x.supplierId===account).map(x=>({id:x.id,date:x.date,created:x.createdAt,type:"Expense",details:x.reason,amount:x.amount,paid:x.paidAmount,change:x.amount-x.paidAmount})),
          ...p.payments.filter(x=>x.supplierId===account).map(x=>({id:x.id,date:x.date,created:x.createdAt,type:"Payment",details:x.reference||paymentLabels[x.paidFrom],amount:0,paid:x.amount,change:-x.amount})),
        ].sort((a,b)=>b.date.localeCompare(a.date)||b.created.localeCompare(a.created)).map(x=><tr key={x.id}><td>{x.date}</td><td>{x.type}</td><td>{x.details}</td><td>{money(x.amount)}</td><td>{money(x.paid)}</td><td>{money(x.change)}</td></tr>)}</tbody></table></div>
      </>}
    </>}
  </main>;
}
