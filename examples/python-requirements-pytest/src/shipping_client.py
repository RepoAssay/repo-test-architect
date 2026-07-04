import requests


class ShippingClient:
    def fetch_status(self, shipment_id):
        response = requests.get(f"https://example.invalid/shipments/{shipment_id}")
        if response.status_code == 404:
            return None

        return response.json()

