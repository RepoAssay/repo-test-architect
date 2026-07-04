from dataclasses import dataclass


@dataclass
class PaymentResponse:
    payment_id: str
    status: str
