export type PaidFrom = "cash" | "upi" | "card" | "bank";
export type Supplier = {
  id: string; name: string; phone: string; address: string; notes: string;
  openingBalance: number; version: number; createdAt: string; updatedAt: string;
};
export type Purchase = {
  id: string; date: string; supplierId: string; billNumber: string; notes: string;
  lines: { ingredientId: string; name: string; unit: string; quantity: number; amount: number }[];
  amount: number; paidAmount: number; paidFrom: PaidFrom; createdAt: string; actor: string;
};
export type Expense = {
  id: string; date: string; reason: string; amount: number; explanation: string;
  employeeId: string; employee: string; supplierId: string; paidAmount: number;
  paidFrom: PaidFrom; createdAt: string; actor: string;
};
export type SupplierPayment = {
  id: string; date: string; supplierId: string; amount: number; paidFrom: PaidFrom;
  reference: string; notes: string; createdAt: string; actor: string;
};
export type PantryData = {
  stockChanges: StockChange[];
  profiles: SalaryProfile[]; accruals: SalaryAccrual[]; caEnabled: boolean; caVersion: number;
  suppliers: Supplier[]; purchases: Purchase[]; expenses: Expense[]; payments: SupplierPayment[];
  staff: { id: string; name: string }[];
};
export const expenseReasons = ["Milk", "Petrol", "Salary", "Advance salary", "Stationery", "Vegetables", "Groceries", "Staff expense", "Delivery", "Electricity", "Gas", "Rent", "Internet", "Water", "Maintenance", "Advertisement", "Other", "Petty cash settlement"] as const;
export const paymentLabels: Record<PaidFrom, string> = { cash: "Cash drawer", upi: "UPI", card: "Card", bank: "Bank account" };
export function supplierBalance(data: Pick<PantryData, "suppliers" | "purchases" | "expenses" | "payments">, id: string) {
  return (data.suppliers.find(s => s.id === id)?.openingBalance ?? 0)
    + data.purchases.filter(p => p.supplierId === id).reduce((sum,p) => sum + p.amount - p.paidAmount,0)
    + data.expenses.filter(p => p.supplierId === id).reduce((sum,p) => sum + p.amount - p.paidAmount,0)
    - data.payments.filter(p => p.supplierId === id).reduce((sum,p) => sum + p.amount,0);
}
export type SalaryProfile = { id:string; monthlySalary:number; notes:string; version:number; updatedAt:string };
export type SalaryAccrual = { id:string; employeeId:string; employee:string; month:string; date:string; amount:number; notes:string; createdAt:string; actor:string };
export function salaryBalance(data:Pick<PantryData,"accruals"|"expenses">,employeeId:string) {
  return data.accruals.filter(a=>a.employeeId===employeeId).reduce((s,a)=>s+a.amount,0)
    - data.expenses.filter(e=>e.employeeId===employeeId && ["Salary","Advance salary"].includes(e.reason)).reduce((s,e)=>s+e.paidAmount,0);
}
export function cashOutflowForDay(data:Pick<PantryData,"purchases"|"expenses"|"payments">,day:string) {
  return data.purchases.filter(p=>p.date===day&&p.paidFrom==="cash").reduce((s,p)=>s+p.paidAmount,0)
    + data.expenses.filter(p=>p.date===day&&p.paidFrom==="cash").reduce((s,p)=>s+p.paidAmount,0)
    + data.payments.filter(p=>p.date===day&&p.paidFrom==="cash").reduce((s,p)=>s+p.amount,0);
}
export type StockChange = {id:string;date:string;ingredientId:string;name:string;unit:string;quantity:number;kind:string;reason:string;actor:string;createdAt:string};
