import pytest

from advanced.parser import parse_quantity


@pytest.fixture
def parsed_quantity():
    return parse_quantity("2")


@pytest.fixture
def checkout_context(parsed_quantity):
    return {"quantity": parsed_quantity}
