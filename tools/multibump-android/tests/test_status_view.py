"""Offline status reporting and durable evidence checks."""
from pathlib import Path
from tempfile import TemporaryDirectory
import sqlite3
import unittest

from engine import Service, Store, Timing
from response_reader import evaluate
from status_view import show_status


def svc(key: str, app_id: int, cooldown: int = 7200) -> Service:
    return Service(key, key.title(), 123456789012345678, 123456789012345679,
                   app_id, "bump", cooldown, ("bump done",), ("please wait",), {}, app_id)


class V13StatusTests(unittest.TestCase):
    def test_missing_state_is_read_only(self):
        with TemporaryDirectory() as d:
            db_path = Path(d) / "missing.sqlite3"
            lines: list[str] = []
            show_status(db_path, output=lines.append)
            self.assertFalse(db_path.exists())
            self.assertEqual(lines, ["Run history: none yet"])

    def test_each_outcome_is_reported_separately_and_deadlines_survive_status_view(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "state.sqlite3"
            a = svc("discadia-152418", 1222548162741538938, 86400)
            b = svc("onebump-152418", 1028956609382199346)
            c = svc("d-invites-152418", 678211574183362571)
            db = Store(path, timing=Timing())
            db.init_services([a, b, c], now=1000)
            db.reserve(a, now=1794710500)
            text = "The 420 Lobby bumped. +1 Boost earned. Next bump <t:1794797311:R>"
            outcome, detail, wait, count = evaluate(text, a, now=1794711000)
            db.update(a, outcome, detail, now=1794711000, retry_after=wait, observed_bumps=count)
            db.update(b, "no_confirmation", "No visible reply", now=1794711000)
            db.update(c, "response_seen", "Read reply, no proof", now=1794711000)
            db.record_connection("disconnect", now=1794711100)
            db.record_connection("resume", now=1794711101)
            before = db.states()
            db.close()
            lines: list[str] = []
            show_status(path, {"discadia-152418": "Discadia"}, now=1794711200,
                        output=lines.append)
            report = "\n".join(lines)
            self.assertIn("Bot-confirmed 1", report)
            self.assertIn("No reply 1", report)
            self.assertIn("Reply, no proof 1", report)
            self.assertIn("Connection: 1 disconnect events, 1 resume events", report)
            self.assertIn("Last own bot confirmation:", report)
            self.assertIn("onebump-152418", report)
            db = Store(path)
            self.assertEqual(db.states(), before)
            db.close()

    def test_success_with_reported_longer_deadline_and_restart(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "state.db"
            service = svc("discadia", 1222548162741538938, 86400)
            db = Store(path)
            db.init_services([service], now=1000)
            db.reserve(service, now=1200)
            db.update(service, "confirmed", "boost earned", now=1300, retry_after=90000)
            first = db.next_attempt_at(service)
            self.assertGreaterEqual(first, 1300 + 90000 + 120)
            db.close()
            db = Store(path)
            db.init_services([service], now=2000)
            self.assertEqual(db.next_attempt_at(service), first)
            self.assertFalse(db.due(service, now=first - 1))
            db.close()

    def test_connection_logging_does_not_affect_queue_or_count_as_bump(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "state.db"
            service = svc("onebump", 1028956609382199346)
            db = Store(path)
            db.init_services([service], now=1000)
            before = db.next_attempt_at(service)
            db.record_connection("disconnect", now=1020)
            db.record_connection("resume", now=1021)
            self.assertEqual(db.next_attempt_at(service), before)
            with self.assertRaises(ValueError):
                db.record_connection("bump", now=1022)
            db.close()
            lines: list[str] = []
            show_status(path, now=1100, output=lines.append)
            self.assertIn("Attempts 0", "\n".join(lines))
            self.assertIn("Connection: 1 disconnect events", "\n".join(lines))


if __name__ == "__main__":
    unittest.main()
