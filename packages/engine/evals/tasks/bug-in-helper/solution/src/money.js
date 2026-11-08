/** Converts an amount in dollars to whole cents. */
export function toCents(dollars) {
  return Math.round(dollars * 100);
}

/** Formats whole cents as "$1,234.50". */
export function formatCents(cents) {
  const dollars = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `$${dollars.toLocaleString("en-US")}.${rest}`;
}
