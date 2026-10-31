"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { indiaDay, money } from "@/lib/types";
import type { Expense } from "@/lib/pantry-types";
export default function ExpenseCalendar({entries,date,onSelect}:{entries:Expense[];date:string;onSelect:(day:string)=>void}) {
  const [month,setMonth]=useState(date.slice(0,7));
  useEffect(()=>setMonth(date.slice(0,7)),[date]);
  const [year,m]=month.split("-").map(Number),first=new Date(Date.UTC(year,m-1,1)).getUTCDay(),days=new Date(Date.UTC(year,m,0)).getUTCDate();
  const move=(delta:number)=>{const d=new Date(Date.UTC(year,m-1+delta,1));setMonth(d.toISOString().slice(0,7));};
  return <section className="panel expense-calendar" aria-label="Expense calendar">
    <div className="calendar-heading"><button type="button" className="icon-button" aria-label="Previous month" onClick={()=>move(-1)}><ChevronLeft size={18}/></button><label>Expense month<input type="month" max={indiaDay().slice(0,7)} value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><button type="button" className="icon-button" aria-label="Next month" disabled={month>=indiaDay().slice(0,7)} onClick={()=>move(1)}><ChevronRight size={18}/></button></div>
    <p className="muted">Select a date to enter an expense or view that day’s records. Past dates are supported.</p>
    <div className="calendar-grid">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><span className="calendar-day-label" key={d}>{d}</span>)}{Array.from({length:first},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,"0")}`,total=entries.filter(e=>e.date===day).reduce((s,e)=>s+e.amount,0);return <button type="button" key={day} aria-label={`Expenses ${day}${total?`, ${money(total)}`:""}`} aria-pressed={date===day} disabled={day>indiaDay()} onClick={()=>onSelect(day)}><span>{i+1}</span>{total>0&&<small>{money(total)}</small>}</button>;})}</div>
  </section>;
}
