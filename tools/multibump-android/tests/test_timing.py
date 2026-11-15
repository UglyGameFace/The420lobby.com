"""Durable deadline, cooldown, restart, and shared dispatch regression tests."""
import json
from pathlib import Path
import random
import sqlite3
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from engine import Service, Store, Timing
from home import edit_timing, show_status


def service(key="a", cooldown=7200):
    return Service(key, key, 123456789012345678, 123456789012345679,
                   123456789012345680, "bump", cooldown, ("bumped",), ("wait",), {},
                   123456789012345680)


def minimum_rng():
    return Mock(randint=Mock(side_effect=lambda low, high: low))


class TimingTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / "state.db"
        self.db = Store(self.path, rng=minimum_rng())
        self.a, self.b = service("a"), service("b")

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_every_cycle_has_a_new_bounded_delay_and_own_cooldown(self):
        self.db.rng = random.Random(71)
        daily = service("daily", 86400)
        self.db.init_services([self.a, daily], now=100)
        delays = set()
        for index in range(50):
            for current in (self.a, daily):
                now = 100000 + index * 100000 + (5000 if current is daily else 0)
                self.assertTrue(self.db.reserve(current, now=now))
                reserved = self.db.next_attempt_at(current)
                self.db.update(current, "confirmed", now=now)
                due = self.db.next_attempt_at(current)
                self.assertEqual(reserved, due, "a response must reuse this cycle's chosen delay")
                extra = due - now - current.cooldown_seconds
                self.assertGreaterEqual(extra, 120)
                self.assertLessEqual(extra, 1020)
                self.assertFalse(self.db.due(current, now=now + current.cooldown_seconds))
                delays.add(extra)
        self.assertGreater(len(delays), 20)

    def test_polling_and_restart_do_not_redraw_due_times(self):
        self.db.init_services([self.a], now=100)
        self.db.reserve(self.a, now=115)
        self.db.update(self.a, "confirmed", now=130)
        before = self.db.states()
        for now in range(131, 200):
            self.assertFalse(self.db.due(self.a, now=now))
        self.db.close()
        self.db = Store(self.path, rng=Mock(randint=Mock(side_effect=AssertionError("must not redraw"))))
        self.db.init_services([self.a], now=200)
        self.assertEqual(self.db.states(), before)

    def test_crash_after_reserving_holds_full_cooldown(self):
        self.db.init_services([self.a], now=100)
        self.assertTrue(self.db.reserve(self.a, now=115))
        due = self.db.next_attempt_at(self.a)
        self.db.close()
        self.db = Store(self.path, rng=minimum_rng())
        self.db.init_services([self.a], now=120)
        self.assertFalse(self.db.reserve(self.a, now=120))
        self.assertEqual(self.db.next_attempt_at(self.a), due)
        self.assertGreaterEqual(due, 115 + 7200 + 120)

    def test_overdue_services_have_a_shared_persisted_gap(self):
        services = [service(str(i)) for i in range(6)]
        self.db.init_services(services, now=100)
        now = 10000
        for current in services:
            self.assertTrue(self.db.reserve(current, now=now))
            self.db.update(current, "unverified", now=now)
            for other in services:
                self.assertFalse(self.db.reserve(other, now=now))
            # Restarting cannot bypass the selected dispatch gap.
            self.db.close()
            self.db = Store(self.path, rng=minimum_rng())
            self.db.init_services(services, now=now + 1)
            for other in services:
                self.assertFalse(self.db.due(other, now=now + 44))
            now += 45

    def test_two_connections_cannot_claim_same_send_slot(self):
        self.db.init_services([self.a, self.b], now=100)
        other = Store(self.path, rng=minimum_rng())
        try:
            self.assertTrue(self.db.reserve(self.a, now=115))
            self.assertFalse(other.reserve(self.b, now=115))
            self.assertTrue(other.reserve(self.b, now=160))
        finally:
            other.close()

    def test_reported_waits_and_uncertain_results_keep_extra_delay(self):
        self.db.init_services([self.a], now=100)
        for wait in (300, 3720, 86400):
            self.db.update(self.a, "cooldown", now=1000, retry_after=wait)
            self.assertEqual(self.db.next_attempt_at(self.a), 1000 + wait + 120)
        self.db.update(self.a, "unverified", now=2000)
        self.assertEqual(self.db.next_attempt_at(self.a), 2000 + 7200 + 120)
        self.assertIsNone(self.db.states()[0][4], "an unknown response is not a verified bump")

    def test_unavailable_or_blocked_service_does_not_consume_send_slot(self):
        self.db.init_services([self.a, self.b], now=100)
        self.assertFalse(self.db.reserve(service("missing"), now=115))
        self.db.update(self.a, "blocked", now=100)
        self.assertFalse(self.db.reserve(self.a, now=115))
        self.assertIsNone(self.db.next_attempt_at(self.a))
        self.assertTrue(self.db.reserve(self.b, now=115))

    def test_legacy_database_upgrade_preserves_history_and_only_extends_once(self):
        legacy = Path(self.temp.name) / "legacy.db"
        with sqlite3.connect(legacy) as db:
            db.execute("""CREATE TABLE schedule(service_id TEXT PRIMARY KEY,status TEXT NOT NULL,
                due_at REAL NOT NULL,last_attempt_at REAL,last_confirmed_at REAL,
                consecutive_errors INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '')""")
            db.execute("INSERT INTO schedule VALUES('a','confirmed',7390,115,130,0,'KEEP NOTE')")
            db.execute("INSERT INTO schedule VALUES('b','blocked',99999,110,NULL,3,'KEEP BLOCKED')")
        with_db = Store(legacy, rng=minimum_rng())
        try:
            with_db.init_services([self.a, self.b], now=200)
            first = with_db.states()
            self.assertEqual(first[0], ("a", "confirmed", 7450, 115, 130, 0, "KEEP NOTE"))
            self.assertEqual(first[1], ("b", "blocked", 99999, 110, None, 3, "KEEP BLOCKED"))
            with_db.init_services([self.a, self.b], now=500)
            self.assertEqual(first, with_db.states())
        finally:
            with_db.close()

    def test_invalid_timing_is_rejected(self):
        for low, high in ((0, 1020), (-10, 1020), (1020, 120), (120, 86401), (True, 120), (1.5, 120)):
            with self.subTest(low=low, high=high), self.assertRaises(ValueError):
                Timing(low, high)
        for invalid in (None, [], {"minimum": 1}, {"extra_delay_min_seconds": "120"}):
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                Timing.from_config({"timing": invalid})

    def test_phone_timing_menu_preserves_services_and_unknown_config(self):
        config = Path(self.temp.name) / "config.json"
        # Disabled entries are retained without requiring a live bot configuration.
        original = {"services": [{"id": "retired", "enabled": False}], "keep": {"data": 42}}
        config.write_text(json.dumps(original))
        with patch("builtins.input", side_effect=["3", "21"]):
            edit_timing(config)
        raw = json.loads(config.read_text())
        self.assertEqual(raw["services"], original["services"])
        self.assertEqual(raw["keep"], original["keep"])
        self.assertEqual(Timing.from_config(raw), Timing(180, 1260))
        before = config.read_bytes()
        for answers in (["30", "2"], ["0"], ["bad"]):
            with patch("builtins.input", side_effect=answers), self.assertRaises(ValueError):
                edit_timing(config)
            self.assertEqual(config.read_bytes(), before)

    def test_status_shows_timing_and_scheduled_time(self):
        self.db.init_services([self.a], now=100)
        self.assertTrue(self.db.reserve(self.a, now=115))
        with patch("builtins.print") as output:
            show_status(Path(self.temp.name) / "config.json", self.path)
        printed = "\n".join(str(call.args[0]) for call in output.call_args_list)
        self.assertIn("2..17 minutes extra", printed)
        self.assertIn("ready now", printed)
        self.assertIn("Last attempt:", printed)


if __name__ == "__main__":
    unittest.main()
