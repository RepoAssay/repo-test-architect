import requests


def fetch_order(order_id: str) -> dict:
    response = requests.get(f"https://orders.example.test/{order_id}", timeout=3)
    return response.json()
