interface ChargeRequest {
  userId: string;
  amount: number;
  token?: string;
}

export async function createCharge(request: ChargeRequest): Promise<Response> {
  if (!request.token) {
    throw new Error("Payment token is required.");
  }

  return fetch("https://payments.example.test/charges", {
    method: "POST",
    body: JSON.stringify(request)
  });
}
