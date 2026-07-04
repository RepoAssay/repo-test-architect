import unittest

from src.inventory_parser import parse_quantity


class InventoryParserTests(unittest.TestCase):
    def test_parse_quantity_casts_string(self):
        self.assertEqual(parse_quantity({"quantity": "2"}), 2)

