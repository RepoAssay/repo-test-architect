from dataclasses import dataclass


@dataclass
class PaymentResponse:
    id: str
    status: str
