/** Sum of price * quantity for every line. */
export function subtotal(lines) {
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    total += lines[i].price * lines[i].quantity;
  }
  return total;
}

/** Applies a percentage discount, e.g. 10 means 10% off. */
export function applyDiscount(amount, percent) {
  return amount - (amount * percent) / 100;
}

/** Rounds to cents. */
export function roundCents(amount) {
  return Math.round(amount * 100) / 100;
}
