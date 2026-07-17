export function parseOrderTotal(value: string): number {
  const total = Number(value.trim());
  if (!Number.isFinite(total) || total < 0) {
    throw new TypeError("Order total must be a non-negative number");
  }

  return total;
}
