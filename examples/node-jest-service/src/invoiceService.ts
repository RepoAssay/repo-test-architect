import axios from "axios";

interface InvoiceRequest {
  customerId: string;
  amount: number;
  token?: string;
}

export async function createInvoice(request: InvoiceRequest): Promise<string> {
  if (!request.token) {
    throw new Error("Token is required.");
  }

  if (request.amount <= 0) {
    throw new Error("Amount must be positive.");
  }

  const response = await axios.post("https://billing.example.test/invoices", request);
  return response.data.id;
}
