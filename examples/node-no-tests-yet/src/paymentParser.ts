export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
}

export function parsePaymentRecord(input: string): PaymentRecord {
  const parsed = JSON.parse(input) as Partial<PaymentRecord>;

  if (!parsed.id) {
    throw new Error("Payment id is required.");
  }

  if (!parsed.amount || parsed.amount <= 0) {
    throw new Error("Payment amount must be positive.");
  }

  return {
    id: parsed.id,
    amount: parsed.amount,
    currency: parsed.currency ?? "USD"
  };
}
