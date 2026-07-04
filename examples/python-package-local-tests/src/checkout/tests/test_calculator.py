from src.checkout.calculator import calculate_total


def test_calculate_total_uses_quantity():
    assert calculate_total([{"price": 10, "quantity": 2}]) == 20

