def calculate_discount_for_quantity(quantity: int) -> float:
    if quantity >= 10:
        return 0.15
    if quantity >= 5:
        return 0.05
    return 0.0
