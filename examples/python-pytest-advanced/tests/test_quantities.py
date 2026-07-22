import pytest
from hypothesis import given, strategies as st

from advanced.validator import is_valid_quantity


def test_checkout_context(checkout_context):
    assert checkout_context["quantity"] == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("quantity", [1, 2])
async def test_async_quantities(quantity):
    assert is_valid_quantity(quantity)


@pytest.mark.anyio
async def test_anyio_quantity():
    assert is_valid_quantity(1)


@given(st.integers(min_value=1))
def test_positive_quantities(quantity):
    assert is_valid_quantity(quantity)
