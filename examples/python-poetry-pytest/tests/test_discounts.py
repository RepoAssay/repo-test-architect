from orders.discounts import calculate_discount_for_quantity


def test_calculate_discount_for_quantity():
    assert calculate_discount_for_quantity(10) == 0.15
