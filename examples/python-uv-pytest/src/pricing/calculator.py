def calculate_total(subtotal: float, tax_rate: float) -> float:
    if subtotal < 0:
        raise ValueError("subtotal cannot be negative")
    return subtotal + (subtotal * tax_rate)
