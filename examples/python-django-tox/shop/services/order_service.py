async def submit_order(client, order):
    return await client.post("/orders", json=order)
