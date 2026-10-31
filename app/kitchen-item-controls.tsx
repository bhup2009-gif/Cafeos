"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Ticket } from "@/lib/types";
export const priorityLabels = { first: "Serve first", normal: "Normal", later: "Serve later" };
export default function KitchenItemControls({ ticket, index, disabled, chef, run }: {
  ticket: Ticket; index: number; disabled: boolean; chef: boolean;
  run: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const item = ticket.lines[index];
  const status = item.status ?? ticket.status;
  const [minutes, setMinutes] = useState(String(item.estimatedMinutes ?? 15));
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const closed = ["Cancelled", "Served"].includes(status);
  const send = (kind: string, extra = {}) => run("ticketItem", { id: ticket.id, index, kind, ...extra });
  return <div className="kitchen-item-controls">
    <div className="item-preparation-row">
      {chef && !closed && ["New", "Preparing"].includes(status) && <form className="kitchen-estimate" onSubmit={e => { e.preventDefault(); void send("estimate", { minutes: Number(minutes) }); }}>
        <label htmlFor={`item-${ticket.id}-${index}`}>Item time (minutes)</label>
        <div><input id={`item-${ticket.id}-${index}`} type="number" min="1" max="240" required value={minutes} disabled={disabled} onChange={e => setMinutes(e.target.value)} /><button className="secondary" disabled={disabled}>{item.readyAt ? "Update time" : "Set time"}</button></div>
      </form>}
      <div className="item-serving-priority"><small>Serving priority</small><span className={`priority-tag priority-${item.priority ?? "normal"}`}>{priorityLabels[item.priority ?? "normal"]}</span></div>
    </div>
    {item.readyAt && !closed && <p className="ticket-time">Ready around {new Date(item.readyAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</p>}
    {status !== "New" && <span className="item-state">{status}</span>}
    {item.cancellationReason && <p className="note">Cancelled: {item.cancellationReason}</p>}
    {chef && !closed && <>
      <button type="button" className="primary item-accept" disabled={disabled} onClick={() => send(status === "New" ? "accept" : status === "Preparing" ? "ready" : "serve")}>
        <Check size={28} strokeWidth={3} /> {status === "New" ? "Accept item" : status === "Preparing" ? "Item ready" : "Item served"}
      </button>
      {["New", "Preparing"].includes(status) && (!cancel ? <button type="button" className="secondary kitchen-cancel" disabled={disabled} onClick={() => setCancel(true)}>Cancel item</button> : <form className="kitchen-cancellation" onSubmit={e => { e.preventDefault(); void send("cancel", { reason }); }}>
        <label htmlFor={`cancel-${ticket.id}-${index}`}>Reason for cancelling {item.name}</label><textarea id={`cancel-${ticket.id}-${index}`} required minLength={3} maxLength={300} value={reason} disabled={disabled} onChange={e => setReason(e.target.value)} />
        <small>Stops preparation at this station. Counter staff handle bill adjustments separately.</small>
        <div><button type="button" className="secondary" disabled={disabled} onClick={() => setCancel(false)}>Keep item</button><button className="secondary kitchen-cancel" disabled={disabled || reason.trim().length < 3}>Confirm item cancellation</button></div>
      </form>)}
    </>}
  </div>;
}
