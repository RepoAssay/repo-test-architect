class PaymentService:
    async def authorize(self, gateway, payment_id):
        response = await gateway.authorize(payment_id)
        if response.status_code >= 400:
            return None

        return response.json()
