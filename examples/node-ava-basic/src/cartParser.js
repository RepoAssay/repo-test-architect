export function parseCartTotal(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total < 0) {
    throw new TypeError("Cart total must be a non-negative number");
  }

  return total;
}
