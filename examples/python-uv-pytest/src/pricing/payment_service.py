import httpx


async def capture_payment(payment_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(f"https://payments.example.test/{payment_id}/capture")
        return response.json()
