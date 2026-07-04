from dataclasses import dataclass


@dataclass
class OrderResponse:
    order_id: str
    status: str

