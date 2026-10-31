import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const folder=mkdtempSync(join(tmpdir(),"cafeos-pantry-"));
process.env.CAFEOS_DATA_DIR=folder;
process.env.CAFEOS_DEMO_PASSWORD="test-password-123";
const {execute,snapshot}=await import("../lib/service");
const {supplierBalance,salaryBalance,cashOutflowForDay}=await import("../lib/pantry-types");
const {indiaDay}=await import("../lib/types");
const {reportFor,reportCSV,reportXLSX}=await import("../lib/reports");
const owner={id:"owner",name:"Owner",role:"owner"} as const;
const manager={id:"manager",name:"Manager",role:"manager"} as const;
const cashier={id:"cashier",name:"Cashier",role:"cashier"} as const;
const barista={id:"barista",name:"Barista",role:"barista"} as const;
const command=(action:string,payload:unknown,user:typeof owner|typeof manager|typeof cashier|typeof barista=owner,operationId=crypto.randomUUID())=>execute(user,{action,payload,operationId});
const day=indiaDay(),supplierId=crypto.randomUUID();
const supplierPayload={id:supplierId,version:0,name:"Daily Dairy",phone:"",address:"",notes:"",openingBalance:50000};
after(()=>rmSync(folder,{recursive:true,force:true}));
test("pantry finance is role protected and snapshots hide private records",()=>{
  for(const user of [cashier,barista])assert.throws(()=>command("pantrySupplier",supplierPayload,user),/role/);
  command("pantrySupplier",supplierPayload);
  assert.equal(snapshot(cashier).pantry.suppliers.length,0);
  assert.equal(snapshot(manager).pantry.suppliers.length,1);
});
test("supplier opening debt is immutable and edits use optimistic versions",()=>{
  assert.throws(()=>command("pantrySupplier",{...supplierPayload,version:1,openingBalance:100}),/Opening balance/);
  assert.throws(()=>command("pantrySupplier",supplierPayload),/changed/);
  assert.throws(()=>command("pantrySupplier",{...supplierPayload,id:crypto.randomUUID()}),/already exists/);
});
const purchase={date:day,supplierId,billNumber:"INV-001",notes:"Milk",paidAmount:25000,paidFrom:"cash",lines:[{ingredientId:"milk",quantity:1000,amount:100000}]};
test("purchase stock, bill and credit commit together; replay cannot double stock",()=>{
  const stock=snapshot(owner).ingredients.find(i=>i.id==="milk")!.stock;
  const operationId=crypto.randomUUID();
  const result=command("pantryPurchase",purchase,owner,operationId);
  assert.deepEqual(command("pantryPurchase",purchase,owner,operationId),result);
  assert.equal(snapshot(owner).ingredients.find(i=>i.id==="milk")!.stock,stock+1000);
  assert.equal(snapshot(owner).pantry.purchases.length,1);
  assert.equal(supplierBalance(snapshot(owner).pantry,supplierId),125000);
  assert.throws(()=>command("pantryPurchase",purchase),/already recorded/);
});
test("invalid purchase line rolls back stock and rejects invalid amounts or dates",()=>{
  const before=snapshot(owner);
  assert.throws(()=>command("pantryPurchase",{...purchase,billNumber:"INV-002",lines:[...purchase.lines,{ingredientId:"missing",quantity:2,amount:1000}]}),/ingredient/);
  assert.deepEqual(snapshot(owner).ingredients,before.ingredients);
  assert.deepEqual(snapshot(owner).pantry.purchases,before.pantry.purchases);
  assert.throws(()=>command("pantryPurchase",{...purchase,billNumber:"INV-002",paidAmount:100001}),/exceed/);
  assert.throws(()=>command("pantryPurchase",{...purchase,billNumber:"INV-002",date:"2026-02-30"}));
  assert.throws(()=>command("pantryPurchase",{...purchase,billNumber:"INV-002",date:"2099-01-01"}));
});
const expense={date:day,reason:"Electricity",amount:15000,paidAmount:5000,paidFrom:"cash",supplierId,explanation:"Partial payment",employeeId:""};
test("expenses support credit and backdates; invalid batch is atomic",()=>{
  const before=snapshot(owner).pantry.expenses.length;
  assert.throws(()=>command("pantryExpenses",{entries:[expense,{...expense,employeeId:"missing"}]}),/employee/);
  assert.equal(snapshot(owner).pantry.expenses.length,before);
  assert.throws(()=>command("pantryExpenses",{entries:[{...expense,supplierId:""}]}),/supplier/);
  command("pantryExpenses",{entries:[expense]});
  command("pantryExpenses",{entries:[{...expense,date:"2023-08-19",amount:2500,paidAmount:2500,paidFrom:"bank"}]});
  assert.equal(supplierBalance(snapshot(owner).pantry,supplierId),135000);
  assert.ok(snapshot(owner).pantry.expenses.some(e=>e.date==="2023-08-19"));
});
test("supplier settlement reduces debt once and cannot overpay",()=>{
  const payload={date:day,supplierId,amount:20000,paidFrom:"cash",reference:"",notes:"Part payment"};
  const key=crypto.randomUUID();command("pantryPayment",payload,owner,key);command("pantryPayment",payload,owner,key);
  assert.equal(supplierBalance(snapshot(owner).pantry,supplierId),115000);
  assert.throws(()=>command("pantryPayment",{...payload,amount:115001}),/exceeds/);
  assert.throws(()=>command("pantryPayment",{...payload,paidFrom:"upi"}),/reference/);
});
test("cash closing deducts only actual cash outflows, without counting purchases as expenses",()=>{
  const pantry=snapshot(owner).pantry;
  assert.equal(pantry.purchases.length,1);
  assert.equal(pantry.expenses.length,2);
  assert.equal(cashOutflowForDay(pantry,day),50000);
  const result=command("closeDay",{date:day,counted:0,note:"Test"});
  assert.equal(result.expected,-50000);
});
test("owner salary accounts track accruals, advances and linked payments once",()=>{
  assert.throws(()=>command("salaryProfile",{employeeId:"cashier",version:0,monthlySalary:2000000,notes:""},manager),/role/);
  command("salaryProfile",{employeeId:"cashier",version:0,monthlySalary:2000000,notes:"Monthly"});
  command("pantryExpenses",{entries:[{...expense,supplierId:"",employeeId:"cashier",reason:"Advance salary",amount:100000,paidAmount:100000}]});
  assert.equal(salaryBalance(snapshot(owner).pantry,"cashier"),-100000);
  command("salaryAccrue",{employeeId:"cashier",month:day.slice(0,7),date:day,amount:2000000,notes:""});
  assert.equal(salaryBalance(snapshot(owner).pantry,"cashier"),1900000);
  assert.throws(()=>command("salaryAccrue",{employeeId:"cashier",month:day.slice(0,7),date:day,amount:2000000,notes:""}),/already recorded/);
  command("pantryExpenses",{entries:[{...expense,supplierId:"",employeeId:"cashier",reason:"Salary",amount:500000,paidAmount:500000,paidFrom:"bank"}]});
  assert.equal(salaryBalance(snapshot(owner).pantry,"cashier"),1400000);
  assert.throws(()=>command("pantryExpenses",{entries:[{...expense,supplierId:"",employeeId:"cashier",reason:"Salary",amount:1500000,paidAmount:1500000}]}),/exceeds/);
  assert.equal(snapshot(manager).pantry.profiles.length,0);
  assert.equal(snapshot(manager).pantry.expenses.some(e=>["Salary","Advance salary"].includes(e.reason)),false);
});
test("CA toggle blocks reports server-side and exports use date ranges without duplicate costs",()=>{
  assert.throws(()=>reportFor(owner,"ca-transactions"),/turned off/);
  assert.throws(()=>command("pantryCASettings",{enabled:true,version:0},manager),/role/);
  command("pantryCASettings",{enabled:true,version:0});
  const r=reportFor(owner,"ca-transactions",day,day);
  assert.ok(r.rows.length>0);
  assert.ok(r.rows.every(row=>row.length===r.headers.length));
  assert.equal(r.rows.filter(row=>row[1]==="Stock purchase").length,1);
  const salary=r.rows.find(row=>row[1]==="Salary / advance payment")!;
  assert.equal(salary[6],0); // Salary payout is settlement; salary accrual books the cost.
  assert.ok(!r.rows.some(row=>row[0]==="2023-08-19"));
  assert.equal(reportXLSX(r).subarray(0,2).toString(),"PK");
  assert.ok(reportCSV(r).includes("Classification"));
  assert.throws(()=>reportFor(manager,"ca-payroll",day,day),/role/);
  assert.throws(()=>reportFor(owner,"ca-stock","2026-02-30",day),/date range/);
  command("pantryCASettings",{enabled:false,version:1});
  assert.throws(()=>reportFor(owner,"ca-suppliers",day,day),/turned off/);
  assert.equal(snapshot(owner).pantry.purchases.length,1);
});

test("CA historical supplier entries remain visible when recorded after their effective date",()=>{
  command("pantryCASettings",{enabled:true,version:2});
  const historical=reportFor(owner,"ca-suppliers","2023-08-01","2023-08-19");
  assert.equal(historical.rows.length,1);
  assert.equal(historical.rows[0][2],0); // Opening balance was introduced later.
  assert.equal(historical.rows[0][4],25);
  assert.equal(historical.rows[0][6],0); // Historical expense was paid in full.
  const transactions=reportFor(owner,"ca-transactions",day,day);
  const salaryChange=transactions.rows.filter(r=>String(r[1]).startsWith("Salary")).reduce((s,r)=>s+Number(r[8]),0);
  assert.equal(salaryChange,14000);
});

test("manual stock changes preserve effective date, stock quantity and non-cash history",()=>{
  const before=snapshot(owner).ingredients.find(i=>i.id==="milk")!.stock;
  command("adjustStock",{id:"milk",kind:"Adjustment",amount:250,reason:"Backdated count correction",date:"2023-08-19"});
  const data=snapshot(owner);
  assert.equal(data.ingredients.find(i=>i.id==="milk")!.stock,before+250);
  assert.equal(data.pantry.stockChanges[0].date,"2023-08-19");
  const report=reportFor(owner,"ca-stock","2023-08-19","2023-08-19");
  assert.equal(report.rows[0][1],"Manual Adjustment");
  assert.equal(report.rows[0][7],250);
  assert.equal(report.rows[0][8],"");
});
test("invalid manual stock date rolls back the quantity change",()=>{
  const before=snapshot(owner);
  assert.throws(()=>command("adjustStock",{id:"milk",kind:"Adjustment",amount:250,reason:"Invalid future count",date:"2099-01-01"}));
  assert.deepEqual(snapshot(owner).ingredients,before.ingredients);
  assert.deepEqual(snapshot(owner).pantry.stockChanges,before.pantry.stockChanges);
});
