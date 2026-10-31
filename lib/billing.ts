import { z } from "zod";
import { DomainError, permit } from "./auth";
import { get, put } from "./db";
import { uploadedRaster } from "./communications";
import type { User } from "./types";
export const contactInput = z
  .object({
    phone: z.string().trim().max(25).default(""),
    email: z.union([z.literal(""), z.email().max(254)]).default(""),
    marketingConsent: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (
      v.phone &&
      (!/^\+?[\d\s()-]{7,25}$/.test(v.phone) ||
        v.phone.replace(/\D/g, "").length < 7 ||
        v.phone.replace(/\D/g, "").length > 15)
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid customer phone number",
        path: ["phone"],
      });
    if (v.marketingConsent && !v.phone && !v.email)
      ctx.addIssue({
        code: "custom",
        message: "Add a phone number or email for marketing opt-in",
        path: ["marketingConsent"],
      });
  });
export type PaymentQR = {
  image: string;
  label: string;
  upiId: string;
  version: number;
};
export const paymentQRRecord = () =>
  get<PaymentQR>("metadata", "paymentQR") || null;
export function paymentQRView() {
  const q = paymentQRRecord();
  return q
    ? {
        label: q.label,
        upiId: q.upiId,
        version: q.version,
        imageUrl: `/api/payment-qr?v=${q.version}`,
      }
    : null;
}
export function savePaymentQR(user: User, payload: unknown) {
  permit(user, ["owner"]);
  const p = z
    .object({
      version: z.number().int().min(0),
      label: z.string().trim().min(1).max(80),
      upiId: z
        .string()
        .trim()
        .max(100)
        .refine(
          (v) => !v || /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(v),
          "Enter a valid UPI ID",
        ),
      image: z.string().max(810000).optional(),
    })
    .parse(payload);
  const old = paymentQRRecord();
  if (p.version !== (old?.version || 0))
    throw new DomainError("Payment QR changed. Reopen the editor.", 409);
  const image = p.image || old?.image;
  if (!image)
    throw new DomainError("Upload your bank-issued merchant QR first");
  uploadedRaster(image);
  put("metadata", "paymentQR", {
    image,
    label: p.label,
    upiId: p.upiId,
    version: p.version + 1,
  });
  return paymentQRView();
}
export function cashPart(amount: number, tendered?: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new DomainError("Enter a valid cash amount");
  if (tendered === undefined) return { amount };
  if (
    !Number.isSafeInteger(tendered) ||
    tendered < amount ||
    tendered > 100000000
  )
    throw new DomainError("Cash tendered must cover the cash payment");
  return { amount, tendered, change: tendered - amount };
}
