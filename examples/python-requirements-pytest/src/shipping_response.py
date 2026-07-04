from dataclasses import dataclass


@dataclass
class ShippingResponse:
    shipment_id: str
    status: str

