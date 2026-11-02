"use client";
import { useEffect, useRef, useState } from "react";
import { Phone, X } from "lucide-react";
import type { Subscription } from "@/lib/subscription";
const date = (day: string) => new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
export default function SubscriptionNotice({ subscription }: { subscription?: Subscription }) {
  const [dismissed, setDismissed] = useState("");
  const [manual, setManual] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const key = subscription ? `${subscription.installedOn}:${subscription.checkedOn}:${subscription.status}` : "";
  const due = subscription && subscription.status !== "free";
  const open = !!subscription && (manual || (!!due && dismissed !== key));
  const close = () => { setDismissed(key); setManual(false); };
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) { element.close(); trigger.current?.focus(); }
  }, [open]);
  if (!subscription) return null;
  const expired = subscription.status === "expired";
  return <>
    <button ref={trigger} className="theme-trigger subscription-trigger" onClick={() => setManual(true)}>
      {due ? "Renew CaféOS" : subscription.cloud ? "Subscription" : "Free subscription"}
    </button>
    <dialog ref={dialog} className="subscription-dialog" aria-labelledby="subscription-title" aria-describedby="subscription-description" onCancel={(event) => { event.preventDefault(); close(); }}>
      <button className="subscription-close" onClick={close} aria-label="Close renewal reminder"><X size={24} /></button>
      <p className="subscription-eyebrow">CAFÉOS · SUBSCRIPTION</p>
      <h2 id="subscription-title">{subscription.cloud ? "Your CaféOS subscription" : expired ? "Your free subscription has ended" : due ? "Your free subscription is ending soon" : "Enjoy 6 months of CaféOS, free"}</h2>
      <p id="subscription-description">{expired ? "Contact our team to renew your CaféOS subscription." : due ? `You have ${subscription.daysRemaining} ${subscription.daysRemaining === 1 ? "day" : "days"} left. Contact our team to arrange your renewal.` : subscription.cloud ? "Your subscription is managed by your platform administrator." : "Your free subscription starts when this installation first connects to the café server."}</p>
      <dl><div><dt>Installation activated</dt><dd>{date(subscription.installedOn)}</dd></div><div><dt>{subscription.cloud ? "Access until" : expired ? "Free period ended" : "Free until"}</dt><dd>{date(subscription.expiresOn)}</dd></div></dl>
      <a className="primary subscription-contact" href={`tel:+91${subscription.supportPhone}`}><Phone size={20} /> Renew / Contact support</a>
      <p className="subscription-phone">Call <a href={`tel:+91${subscription.supportPhone}`}>{subscription.supportPhone}</a></p>
      <small>No automatic charge. Contact support to confirm your renewal. Access requires an active subscription.</small>
    </dialog>
  </>;
}
