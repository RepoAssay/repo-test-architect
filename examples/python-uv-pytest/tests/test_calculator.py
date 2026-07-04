from pricing.calculator import calculate_total


def test_calculate_total():
    assert calculate_total(100, 0.25) == 125
