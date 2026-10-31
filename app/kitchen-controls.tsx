"use client";
import { useState } from "react";
import type { Ticket } from "@/lib/types";

export default function KitchenControls({ ticket, disabled, run }: {
  ticket: Ticket;
  disabled: boolean;
  run: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [minutes, setMinutes] = useState(String(ticket.estimatedMinutes ?? 15));
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  if (!["New", "Preparing"].includes(ticket.status)) return null;
  return <div className="kitchen-controls">
    {ticket.readyAt && <p className="ticket-time" role="status">Estimated ready: {new Date(ticket.readyAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} · {Math.max(0, Math.ceil((Date.parse(ticket.readyAt) - Date.now()) / 60000))} min remaining</p>}
    <form className="kitchen-estimate" onSubmit={async e => { e.preventDefault(); await run("ticketEstimate", { id: ticket.id, minutes: Number(minutes) }); }}>
      <label htmlFor={`estimate-${ticket.id}`}>Preparation time (minutes)</label>
      <div><input id={`estimate-${ticket.id}`} type="number" min="1" max="240" step="1" required value={minutes} onChange={e => setMinutes(e.target.value)} disabled={disabled} /><button type="submit" className="secondary" disabled={disabled}>{ticket.readyAt ? "Update estimate" : "Set estimate"}</button></div>
    </form>
    {!cancelling ? <button type="button" className="secondary kitchen-cancel" disabled={disabled} onClick={() => setCancelling(true)}>Cancel order</button> : <form className="kitchen-cancellation" onSubmit={async e => { e.preventDefault(); await run("kitchenCancelOrder", { id: ticket.id, reason }); }}>
      <label htmlFor={`reason-${ticket.id}`}>Reason for cancelling Order #{ticket.orderNumber}</label>
      <textarea id={`reason-${ticket.id}`} required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example, ingredients unavailable" disabled={disabled} />
      <small>Cancels preparation at every station. Consumed stock stays recorded. Any paid bill requires a separate manager refund.</small>
      <div><button className="secondary" type="button" disabled={disabled} onClick={() => setCancelling(false)}>Keep order</button><button className="secondary kitchen-cancel" type="submit" disabled={disabled || reason.trim().length < 3}>Confirm cancellation</button></div>
    </form>}
  </div>;
}
