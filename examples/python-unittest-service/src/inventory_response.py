from dataclasses import dataclass


@dataclass
class InventoryResponse:
    sku: str
    quantity: int

