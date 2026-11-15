"""Remaining waits must not absorb unrelated or repeated duration text."""
import unittest

from bumper import next_attempt_text
from engine import parse_wait_seconds


class WaitParserTests(unittest.TestCase):
    def test_advertised_interval_does_not_extend_remaining_wait(self):
        self.assertEqual(parse_wait_seconds("Please wait another 78 minutes.\nBump every 2 hours."), 4680)
        self.assertEqual(parse_wait_seconds("Bump every 2 hours.\nPlease wait another 78 minutes."), 4680)

    def test_duplicate_reply_is_not_added_twice(self):
        self.assertEqual(parse_wait_seconds("Please wait another 78 minutes.\nPlease wait another 78 minutes."), 4680)

    def test_compound_wait_and_formatting(self):
        for text in ("Try again in 1h 23m", "Try again in 1h23m", "Try again in 1h\n23m", "Wait for **1** hour and **23** minutes."):
            self.assertEqual(parse_wait_seconds(text), 4980, text)
        self.assertEqual(parse_wait_seconds("Please wait another **78** minutes."), 4680)

    def test_other_remaining_wait_phrases(self):
        for text in ("You can bump again in 78 minutes.", "Next bump: 78 minutes.", "Cooldown remaining: 78 minutes.", "78 minutes remaining", "78m"):
            self.assertEqual(parse_wait_seconds(text), 4680, text)
        self.assertEqual(parse_wait_seconds("Please wait 1 day 2 hours"), 93600)

    def test_conflicting_waits_are_unknown(self):
        self.assertIsNone(parse_wait_seconds("Please wait 78 minutes. Try again in 2 hours."))

    def test_generic_durations_are_not_reported_as_remaining_wait(self):
        for text in ("Bump every 2 hours", "Your last bump was 78 minutes ago", "Members active 2 hours ago", "Unknown reply"):
            self.assertIsNone(parse_wait_seconds(text), text)

    def test_invalid_and_decimal_waits_do_not_get_partial_numbers(self):
        for text in ("Wait 0 minutes", "Wait 8 days", "Wait 99999 minutes", "Wait 1.5 minutes", "Wait -5 minutes"):
            self.assertIsNone(parse_wait_seconds(text), text)

    def test_due_and_overdue_deadlines_show_ready_now(self):
        self.assertEqual(next_attempt_text(100, now=100), "ready now (queued)")
        self.assertEqual(next_attempt_text(50, now=100), "ready now (queued)")

    def test_future_deadline_has_countdown(self):
        self.assertIn("in 2h 12m 13s", next_attempt_text(100 + 7932.16, now=100))
        self.assertIn("UTC", next_attempt_text(200, now=100))
        self.assertIn("paused", next_attempt_text(None, now=100))


if __name__ == "__main__":
    unittest.main()
