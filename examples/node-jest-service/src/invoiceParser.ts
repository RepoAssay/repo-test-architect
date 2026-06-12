export interface ParsedInvoice {
  id: string;
  total: number;
}

export function parseInvoice(input: string): ParsedInvoice {
  const parsed = JSON.parse(input) as Partial<ParsedInvoice>;

  if (!parsed.id) {
    throw new Error("Invoice id is required.");
  }

  return {
    id: parsed.id,
    total: parsed.total ?? 0
  };
}
