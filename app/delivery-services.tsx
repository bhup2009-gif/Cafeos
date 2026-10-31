"use client";
import {useState} from "react";
import type {AppData} from "@/lib/types";
export default function DeliveryServices({config,busy,onChange}:{config:AppData["deliveryServices"];busy:boolean;onChange:(payload:unknown)=>Promise<void>}) {
  const [name,setName]=useState("");
  return <section className="panel delivery-settings"><h2>Online delivery services</h2><p className="muted">Manage the services available at the counter. Existing orders keep their delivery details.</p><form className="delivery-add" onSubmit={async e=>{e.preventDefault();await onChange({version:config.version,name});}}><label>Service name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required placeholder="e.g. Zomato" /></label><button className="primary" disabled={busy || !name.trim()}>Add service</button></form><div className="delivery-list">{config.services.filter(s=>s.active).map(s=><div key={s.id}><strong>{s.name}</strong><button className="text-danger" disabled={busy} onClick={()=>onChange({version:config.version,removeId:s.id})}>Remove <span className="sr-only">{s.name}</span></button></div>)}</div></section>;
}
