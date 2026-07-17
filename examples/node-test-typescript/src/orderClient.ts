export async function fetchOrder(orderId: string, token: string): Promise<unknown> {
  const response = await fetch(`/orders/${orderId}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Order request failed with ${response.status}`);
  }

  return response.json();
}
