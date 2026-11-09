import { formatCents, toCents } from "./money.js";

/** Total of an invoice's lines, formatted for display. Each line has a price in dollars and a quantity. */
export function invoiceTotal(lines) {
  let cents = 0;
  for (const line of lines) cents += toCents(line.price) * line.quantity;
  return formatCents(cents);
}
