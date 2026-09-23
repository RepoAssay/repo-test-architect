import unittest

from retrotext.localization import normalize_label


class LocalizationTests(unittest.TestCase):
    def test_empty_label(self):
        self.assertEqual(normalize_label(""), "unknown")

    def test_whitespace(self):
        self.assertEqual(normalize_label(" hello "), "hello")
