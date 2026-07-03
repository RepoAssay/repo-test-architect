from dataclasses import dataclass


@dataclass
class CheckoutResponse:
    total: int
    currency: str

