"""Offline tests for free directory voting: no real logins or vote submissions."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
import sqlite3
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from manage import read_config
from vote_tracker import (
    DAY, DISCORDIFY_LOBBY, VoteLedger, add_target, configured_targets,
    open_link, read_states, remove_target, show_vote_status, validate_url,
)

OTHER = "https://discadia.com/server/test-community"


def target(provider="discordify", url=DISCORDIFY_LOBBY):
    return {"provider": provider, "label": provider, "url": url,
            "cooldown_seconds": DAY}


class VoteTrackerTests(unittest.TestCase):
    def test_reject_unsafe_or_incorrect_vote_links(self):
        self.assertEqual(validate_url("discordify", DISCORDIFY_LOBBY), DISCORDIFY_LOBBY)
        self.assertEqual(validate_url("discadia", OTHER), OTHER)
        for url in (
            "http://discordify.net/server/the-420-lobby",
            "https://discordify.net.evil.test/server/the-420-lobby",
            "https://discordify.net/bot/discordify/",
            "https://discordify.net/",
            "https://user:pass@discordify.net/server/the-420-lobby",
            "https://discordify.net:443/server/the-420-lobby",
            "https://discordify.net/server/the-420-lobby#token",
            "https://127.0.0.1/path",
            "https://localhost/path",
            "javascript:alert(1)",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url("discordify", url)

    def test_custom_directory_must_use_public_https_listing(self):
        self.assertEqual(validate_url("other-directory", "https://vote.example.org/my-server"),
                         "https://vote.example.org/my-server")
        for url in ("https://localhost/vote", "https://10.0.0.1/vote",
                    "https://evil.test/vote\nheader", "http://vote.example.org/server"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_url("other-directory", url)

    def test_add_remove_preserves_bump_configuration(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            path.write_text('{"services": [], "timing": {"extra_delay_min_seconds": 120, "extra_delay_max_seconds": 1020}}')
            self.assertTrue(add_target(path, "discordify", "Discordify", DISCORDIFY_LOBBY))
            self.assertFalse(add_target(path, "discordify", "Discordify", DISCORDIFY_LOBBY))
            self.assertTrue(add_target(path, "discadia", "Discadia", OTHER))
            raw = read_config(path)
            self.assertEqual(len(configured_targets(raw)), 2)
            self.assertEqual(raw["timing"]["extra_delay_max_seconds"], 1020)
            self.assertEqual(raw["services"], [])
            remove_target(path, 0)
            self.assertEqual([t["provider"] for t in read_config(path)["vote_targets"]], ["discadia"])

    def test_global_24h_clock_prevents_multiple_discordify_votes(self):
        with TemporaryDirectory() as td:
            db_path = Path(td) / "state.sqlite3"
            ledger = VoteLedger(db_path)
            try:
                due = ledger.record_self_report(target(), now=100000)
                self.assertEqual(due, 100000 + DAY)
                other_listing = target(url="https://discordify.net/server/other-community")
                with self.assertRaisesRegex(ValueError, "not eligible"):
                    ledger.record_self_report(other_listing, now=100001)
                self.assertEqual(ledger.state("discordify"), (100000, 100000 + DAY))
                self.assertEqual(ledger.record_self_report(other_listing, now=100000 + DAY),
                                 100000 + DAY * 2)
                count = ledger.db.execute("SELECT COUNT(*) FROM vote_events").fetchone()[0]
                self.assertEqual(count, 2)
            finally:
                ledger.close()

    def test_two_termux_sessions_cannot_record_same_vote_concurrently(self):
        with TemporaryDirectory() as td:
            db_path = Path(td) / "state.sqlite3"
            VoteLedger(db_path).close()
            barrier = Barrier(2)

            def record_in_session():
                ledger = VoteLedger(db_path)
                try:
                    barrier.wait(timeout=5)
                    try:
                        ledger.record_self_report(target(), now=100000)
                        return "recorded"
                    except ValueError:
                        return "blocked"
                finally:
                    ledger.close()

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: record_in_session(), range(2)))
            self.assertEqual(sorted(results), ["blocked", "recorded"])
            with sqlite3.connect(db_path) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM vote_events").fetchone()[0], 1)

    def test_different_services_independent_and_survive_restart(self):
        with TemporaryDirectory() as td:
            db_path = Path(td) / "state.sqlite3"
            ledger = VoteLedger(db_path)
            ledger.record_self_report(target(), now=100000)
            ledger.record_self_report(target("discadia", OTHER), now=100000)
            ledger.close()
            self.assertEqual(read_states(db_path), {
                "discordify": (100000, 100000 + DAY),
                "discadia": (100000, 100000 + DAY),
            })
            ledger = VoteLedger(db_path)
            try:
                with self.assertRaises(ValueError):
                    ledger.record_self_report(target("discadia", OTHER), now=100100)
            finally:
                ledger.close()

    def test_opening_link_does_not_create_state_or_count_as_vote(self):
        with TemporaryDirectory() as td:
            db_path = Path(td) / "state.sqlite3"
            with patch("vote_tracker.shutil.which", return_value=None):
                self.assertFalse(open_link(DISCORDIFY_LOBBY, "discordify"))
            self.assertFalse(db_path.exists())
            self.assertEqual(read_states(db_path), {})

    def test_legacy_bump_database_status_remains_read_only(self):
        with TemporaryDirectory() as td:
            base = Path(td)
            db_path = base / "state.sqlite3"
            with sqlite3.connect(db_path) as db:
                db.execute("CREATE TABLE schedule(service_id TEXT)")
            self.assertEqual(read_states(db_path), {})
            config = base / "config.json"
            add_target(config, "discordify", "Discordify", DISCORDIFY_LOBBY)
            with patch("builtins.print") as capture:
                show_vote_status(config, db_path)
            output = "\n".join(str(call.args[0]) for call in capture.call_args_list)
            self.assertIn("not recorded", output)
            with sqlite3.connect(db_path) as db:
                self.assertIsNone(db.execute(
                    "SELECT name FROM sqlite_master WHERE name='vote_state'").fetchone())

    def test_bad_cooldowns_and_untrusted_config_rejected(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            with self.assertRaises(ValueError):
                add_target(config, "discordify", "Discordify", DISCORDIFY_LOBBY,
                           cooldown_seconds=3600)
            self.assertFalse(config.exists())
            config.write_text('{"services":[],"vote_targets":[{"provider":"discordify","url":"http://bad","cooldown_seconds":86400}]}')
            with self.assertRaises(ValueError):
                configured_targets(read_config(config))


if __name__ == "__main__":
    unittest.main()
