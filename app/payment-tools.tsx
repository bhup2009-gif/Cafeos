"use client";
import { useState } from "react";
import { QrCode, Upload } from "lucide-react";
import { prepareBanner } from "./communications";
import { money, type AppData, type Order } from "@/lib/types";
export function PaymentQRSetup({
  qr,
  busy,
  onSave,
}: {
  qr: AppData["paymentQR"];
  busy: boolean;
  onSave: (value: unknown) => void;
}) {
  const [label, setLabel] = useState(qr?.label || ""),
    [upiId, setUpiId] = useState(qr?.upiId || ""),
    [image, setImage] = useState<string>(),
    [error, setError] = useState(""),
    [processing, setProcessing] = useState(false);
  return (
    <form
      className="qr-settings"
      onSubmit={(e) => {
        e.preventDefault();
        if (!image && !qr) {
          setError("Upload your bank-issued merchant QR image.");
          return;
        }
        onSave({
          version: qr?.version || 0,
          label,
          upiId,
          ...(image ? { image } : {}),
        });
      }}
    >
      <p className="muted">
        Upload the merchant payment QR supplied by your bank or UPI provider. It
        will appear at billing for customers to scan.
      </p>
      <label>
        Merchant / payee name
        <input
          required
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        UPI ID (optional display label)
        <input
          value={upiId}
          maxLength={100}
          placeholder="your-cafe@bank"
          onChange={(e) => setUpiId(e.target.value)}
        />
      </label>
      <label>
        Merchant QR image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setProcessing(true);
            setError("");
            try {
              setImage(await prepareBanner(file));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setProcessing(false);
            }
          }}
        />
      </label>
      {(image || qr?.imageUrl) && (
        <img
          className="qr-preview"
          src={image || qr?.imageUrl}
          alt="Merchant payment QR preview"
        />
      )}
      <p className="notice small">
        Check that scanning this image shows your café’s correct payee account
        before using it at the counter.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy || processing} className="primary">
        <Upload size={16} />
        {processing ? "Preparing image…" : "Save payment QR"}
      </button>
    </form>
  );
}
export function ScanToPay({
  qr,
  amount,
}: {
  qr: AppData["paymentQR"];
  amount: number;
}) {
  return (
    <section className="scan-to-pay" aria-label="UPI scan to pay">
      {qr ? (
        <>
          <div>
            <QrCode size={19} />
            <strong>Scan & pay with any UPI app</strong>
          </div>
          <img src={qr.imageUrl} alt={`Scan to pay ${qr.label}`} />
          <strong>{money(amount)}</strong>
          <p>
            {qr.label}
            {qr.upiId && <small>{qr.upiId}</small>}
          </p>
          <small>Google Pay · Paytm · PhonePe · BHIM and other UPI apps</small>
          <p className="muted">
            Enter {money(amount)} in the payment app if the QR doesn’t fill the
            amount. Confirm the payee and payment on the café’s bank app.
          </p>
        </>
      ) : (
        <p className="notice small">
          Ask the owner to add the café’s merchant QR in Staff → Payment QR. You
          can still record a verified payment from your counter QR.
        </p>
      )}
    </section>
  );
}
export function CustomerContact({
  value,
  onChange,
}: {
  value: Order["contact"];
  onChange: (value: NonNullable<Order["contact"]>) => void;
}) {
  const contact = value || { phone: "", email: "", marketingConsent: false };
  return (
    <details className="contact-details">
      <summary>Customer contact · optional</summary>
      <p className="muted">
        For receipts or future offers. Billing works without these details.
      </p>
      <div className="form-grid">
        <label>
          Customer phone
          <input
            type="tel"
            autoComplete="tel"
            maxLength={25}
            value={contact.phone}
            onChange={(e) => onChange({ ...contact, phone: e.target.value })}
          />
        </label>
        <label>
          Customer email
          <input
            type="email"
            autoComplete="email"
            maxLength={254}
            value={contact.email}
            onChange={(e) => onChange({ ...contact, email: e.target.value })}
          />
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={contact.marketingConsent}
          onChange={(e) =>
            onChange({ ...contact, marketingConsent: e.target.checked })
          }
        />
        <span>Customer agreed to receive offers and marketing messages.</span>
      </label>
    </details>
  );
}
