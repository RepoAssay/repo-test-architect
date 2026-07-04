from orders.order_validator import validate_order


def test_validate_order_accepts_items():
    assert validate_order({"items": [{"sku": "card"}]}) is True

