import type { Line } from "./types";
export function totals(
  lines: Pick<Line, "qty" | "price" | "taxBps">[],
  discountBps = 0,
) {
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10000)
    throw new Error("Invalid discount");
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const discount = Math.round((subtotal * discountBps) / 10000);
  // Allocate the rounded discount proportionally; remainder stays on the last line.
  let allocated = 0;
  const tax = lines.reduce((sum, l, i) => {
    const gross = l.qty * l.price;
    const part =
      i === lines.length - 1
        ? discount - allocated
        : Math.floor((discount * gross) / (subtotal || 1));
    allocated += part;
    return sum + Math.round(((gross - part) * l.taxBps) / 10000);
  }, 0);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}
