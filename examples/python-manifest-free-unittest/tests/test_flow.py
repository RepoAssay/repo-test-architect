import unittest

from profiles.game.flow import next_step


class FlowTests(unittest.TestCase):
    def test_negative_step(self):
        self.assertEqual(next_step(-1), 0)
