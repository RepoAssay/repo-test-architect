export async function loadCart(cartId, token) {
  const response = await fetch(`/carts/${cartId}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Cart request failed with ${response.status}`);
  }

  return response.json();
}
