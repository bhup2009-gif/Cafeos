import { z } from "zod";
import { randomUUID } from "node:crypto";
import { all, get, put, db } from "./db";
import { DomainError, permit } from "./auth";
import { indiaDay, type Ingredient, type User } from "./types";
import { expenseReasons, supplierBalance, salaryBalance, cashOutflowForDay, type SalaryProfile, type SalaryAccrual, type StockChange, type PantryData, type Supplier, type Purchase, type Expense, type SupplierPayment } from "./pantry-types";
const amount = z.number().int().min(0).max(1000000000);
const positiveAmount = amount.refine(v => v > 0, "Enter an amount greater than zero");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v && v <= indiaDay();
}, "Choose a valid date, today or earlier");
const short = z.string().trim().max(300);
const paidFrom = z.enum(["cash", "upi", "card", "bank"]);
const financial = { date, amount: positiveAmount, paidAmount: amount, paidFrom, supplierId: z.string().max(100).default("") };
export function pantrySnapshot(user: User): PantryData {
  if (!["owner", "manager"].includes(user.role)) return { stockChanges:[], suppliers: [], purchases: [], expenses: [], payments: [], staff: [], profiles:[], accruals:[],caEnabled:false,caVersion:0 };
  const ca = get<{caEnabled:boolean; version:number}>("metadata","pantry-settings");
  return {
    stockChanges:all<StockChange>("stock_changes").reverse(),
    profiles:user.role === "owner" ? all<SalaryProfile>("salary_profiles") : [],
    accruals:user.role === "owner" ? all<SalaryAccrual>("salary_accruals") : [],
    caEnabled:user.role === "owner" && !!ca?.caEnabled,
    caVersion:user.role === "owner" ? (ca?.version ?? 0) : 0,
    suppliers: all<Supplier>("pantry_suppliers").sort((a,b)=>a.name.localeCompare(b.name)),
    purchases: all<Purchase>("pantry_purchases").reverse(),
    expenses: all<Expense>("pantry_expenses").filter(e=>user.role === "owner" || !["Salary","Advance salary"].includes(e.reason)).reverse(),
    payments: all<SupplierPayment>("pantry_payments").reverse(),
    staff: db.prepare("SELECT id,name FROM users ORDER BY name").all() as {id:string; name:string}[],
  };
}
function supplier(id: string) {
  const s = get<Supplier>("pantry_suppliers", id);
  if (!s) throw new DomainError("Choose a valid supplier", 404);
  return s;
}
function validatePayment(v: { amount: number; paidAmount: number; supplierId: string }) {
  if (v.paidAmount > v.amount) throw new DomainError("Paid amount cannot exceed the total");
  if (v.supplierId) supplier(v.supplierId);
  if (v.paidAmount < v.amount && !v.supplierId) throw new DomainError("Choose a supplier for unpaid / udhar amounts");
}
function audit(user: User, action: string, detail: string) {
  const id = randomUUID();
  put("audit", id, { id, actor: user.name, action, detail, createdAt: new Date().toISOString() });
}
export function pantryCommand(user: User, action: string, payload: unknown) {
  permit(user, ["owner", "manager"]);
  const createdAt = new Date().toISOString();
  if (action === "pantrySupplier") {
    const v = z.object({ id:z.string().min(1).max(100), version:z.number().int().min(0), name:z.string().trim().min(2).max(100), phone:z.string().trim().max(30).default(""), address:short.default(""), notes:short.default(""), openingBalance:amount }).parse(payload);
    const old = get<Supplier>("pantry_suppliers", v.id);
    if ((old?.version ?? 0) !== v.version) throw new DomainError("Supplier changed. Reload before editing.",409);
    if (all<Supplier>("pantry_suppliers").some(s=>s.id !== v.id && s.name.toLowerCase() === v.name.toLowerCase())) throw new DomainError("A supplier with that name already exists");
    if (old && old.openingBalance !== v.openingBalance) throw new DomainError("Opening balance is fixed after creation. Record purchases or payments instead.");
    const s: Supplier = { ...v, version:v.version+1, createdAt:old?.createdAt ?? createdAt, updatedAt:createdAt };
    put("pantry_suppliers",s.id,s);
    audit(user,"pantry.supplier",s.name);
    return s;
  }
  if (action === "pantryPurchase") {
    const v = z.object({ date, supplierId:z.string().min(1).max(100), billNumber:z.string().trim().max(100).default(""), notes:short.default(""), paidAmount:amount, paidFrom, lines:z.array(z.object({ingredientId:z.string(),quantity:z.number().finite().positive().max(1000000).refine(q=>Math.abs(q*1000-Math.round(q*1000))<0.000001,"Use up to 3 decimal places"), amount:positiveAmount})).min(1).max(50) }).parse(payload);
    supplier(v.supplierId);
    if (v.billNumber && all<Purchase>("pantry_purchases").some(p=>p.supplierId === v.supplierId && p.billNumber.toLowerCase() === v.billNumber.toLowerCase())) throw new DomainError("This supplier bill number was already recorded");
    const total = v.lines.reduce((sum,l)=>sum+l.amount,0);
    if (total > 1000000000) throw new DomainError("Purchase total exceeds the allowed limit");
    validatePayment({...v, amount:total});
    // Everything runs inside execute's transaction, including stock and idempotency.
    const lines = v.lines.map(l=> {
      const i = get<Ingredient>("ingredients",l.ingredientId);
      if (!i) throw new DomainError("Choose a valid stock ingredient");
      i.stock = Math.round((i.stock+l.quantity)*1000)/1000;
      if (i.stock > 1000000000) throw new DomainError("Stock limit exceeded");
      put("ingredients",i.id,i);
      return {...l,name:i.name,unit:i.unit};
    });
    const p: Purchase = {...v, lines, amount:total, id:randomUUID(),createdAt,actor:user.name};
    put("pantry_purchases",p.id,p);
    audit(user,"pantry.purchase",`${p.id}: ${supplier(v.supplierId).name}; total ${total}; paid ${v.paidAmount}; stock received`);
    return p;
  }
  if (action === "pantryExpenses") {
    const { entries } = z.object({entries:z.array(z.object({...financial,reason:z.enum(expenseReasons),explanation:short.default(""),employeeId:z.string().max(100).default("")})).min(1).max(30)}).parse(payload);
    return entries.map(v=> {
      if (["Salary","Advance salary"].includes(v.reason)) {
        permit(user,["owner"]);
        if (!v.employeeId || v.paidAmount !== v.amount || v.supplierId) throw new DomainError("Salary entries require an employee, full payment and no supplier. Use Salary accounts for pending salary.");
        if (v.reason === "Salary" && v.amount > salaryBalance(pantrySnapshot(user), v.employeeId)) throw new DomainError("Salary payment exceeds pending salary. Record salary due first or use Advance salary.");
      }
      validatePayment(v);
      const employee = v.employeeId ? db.prepare("SELECT name FROM users WHERE id=?").get(v.employeeId) as {name:string}|undefined : undefined;
      if (v.employeeId && !employee) throw new DomainError("Choose a valid employee");
      const e: Expense = {...v,id:randomUUID(),employee:employee?.name ?? "",createdAt,actor:user.name};
      put("pantry_expenses",e.id,e);
      audit(user,"pantry.expense",`${e.id}: ${e.reason}; total ${e.amount}; paid ${e.paidAmount}`);
      return e;
    });
  }
  if (action === "pantryPayment") {
    const v = z.object({date,supplierId:z.string().min(1).max(100),amount:positiveAmount,paidFrom,reference:z.string().trim().max(100).default(""),notes:short.default("")}).parse(payload);
    supplier(v.supplierId);
    const balance = supplierBalance(pantrySnapshot(user),v.supplierId);
    if (v.amount > balance) throw new DomainError("Payment exceeds this supplier's outstanding balance. Refresh the account.",409);
    if (v.paidFrom !== "cash" && !v.reference) throw new DomainError("Enter the bank / UPI / card payment reference");
    const p:SupplierPayment = {...v,id:randomUUID(),createdAt,actor:user.name};
    put("pantry_payments",p.id,p);
    audit(user,"pantry.payment",`${p.id}: ${supplier(v.supplierId).name}; ${p.amount} paid from ${p.paidFrom}`);
    return p;
  }
  if (action === "pantryCASettings") {
    permit(user,["owner"]);
    const v = z.object({enabled:z.boolean(),version:z.number().int().min(0)}).parse(payload);
    const old = get<{caEnabled:boolean;version:number}>("metadata","pantry-settings");
    if ((old?.version ?? 0)!==v.version) throw new DomainError("CA setting changed. Reload before saving.",409);
    const result = {caEnabled:v.enabled,version:v.version+1};
    put("metadata","pantry-settings",result);
    audit(user,"pantry.ca",v.enabled?"CA reports enabled":"CA reports hidden; entries retained");
    return result;
  }
  if (action === "salaryProfile") {
    permit(user,["owner"]);
    const v=z.object({employeeId:z.string(),monthlySalary:positiveAmount,notes:short.default(""),version:z.number().int().min(0)}).parse(payload);
    if (!db.prepare("SELECT id FROM users WHERE id=?").get(v.employeeId))throw new DomainError("Employee not found");
    const old=get<SalaryProfile>("salary_profiles",v.employeeId);
    if ((old?.version??0)!==v.version)throw new DomainError("Salary profile changed. Reload before editing.",409);
    const profile:SalaryProfile={id:v.employeeId,monthlySalary:v.monthlySalary,notes:v.notes,version:v.version+1,updatedAt:createdAt};
    put("salary_profiles",profile.id,profile);
    audit(user,"salary.profile",`${v.employeeId}: monthly salary ${v.monthlySalary}`);
    return profile;
  }
  if (action === "salaryAccrue") {
    permit(user,["owner"]);
    const v=z.object({employeeId:z.string(),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),date,amount:positiveAmount,notes:short.default("")}).parse(payload);
    if (v.month>indiaDay().slice(0,7))throw new DomainError("Cannot record salary due for a future month");
    const employee=db.prepare("SELECT name FROM users WHERE id=?").get(v.employeeId) as {name:string}|undefined;
    if(!employee)throw new DomainError("Employee not found");
    if(all<SalaryAccrual>("salary_accruals").some(a=>a.employeeId===v.employeeId&&a.month===v.month))throw new DomainError("Salary due is already recorded for this employee and month");
    const a:SalaryAccrual={...v,id:randomUUID(),employee:employee.name,createdAt,actor:user.name};
    put("salary_accruals",a.id,a);
    audit(user,"salary.due",`${employee.name}, ${v.month}: ${v.amount}`);
    return a;
  }
  throw new DomainError("Unknown pantry action");
}
export function pantryCashOutflow(day:string) {
  return cashOutflowForDay({purchases:all<Purchase>("pantry_purchases"),expenses:all<Expense>("pantry_expenses"),payments:all<SupplierPayment>("pantry_payments")},day);
}

export function recordStockChange(user:User,ingredient:Ingredient,input:{amount:number;kind:string;reason:string;date?:string}) {
  const change:StockChange={id:randomUUID(),date:date.parse(input.date||indiaDay()),ingredientId:ingredient.id,name:ingredient.name,unit:ingredient.unit,quantity:input.amount,kind:input.kind,reason:input.reason,actor:user.name,createdAt:new Date().toISOString()};
  put("stock_changes",change.id,change);
}
