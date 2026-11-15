"""Offline confirmation checks: success requires evidence, not a submitted command."""
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from engine import Service, Store
from response_reader import bump_count, evaluate, message_body, next_bump_wait, response_matches


def svc(key="discordify"):
    return Service(key, key, 123456789012345678, 123456789012345679, 123456789012345680,
                   "bump", 7200, ("bump done", "successfully bumped"),
                   ("please wait", "cooldown", "try again"), {}, 123456789012345680)


class ResponseReaderTests(unittest.TestCase):
    def test_embed_and_edited_content_are_read(self):
        msg = SimpleNamespace(content="", embeds=[SimpleNamespace(
            title="Bump confirmed", description="Bump done", footer=SimpleNamespace(text="Thanks"),
            fields=[SimpleNamespace(name="Next", value="2 hours")])])
        self.assertIn("Bump done", message_body(msg))
        self.assertIn("2 hours", message_body(msg))

    def test_nonmatching_source_or_invoker_cannot_confirm(self):
        now = datetime.now(timezone.utc)
        msg = SimpleNamespace(channel=SimpleNamespace(id=svc().channel_id),
                              author=SimpleNamespace(id=svc().response_author_id),
                              created_at=now + timedelta(seconds=1), content="Bump done",
                              interaction_metadata=SimpleNamespace(user=SimpleNamespace(id=123456789012345600)))
        self.assertTrue(response_matches(msg, svc(), now, 123456789012345600))
        self.assertFalse(response_matches(msg, svc(), now, 123456789012345601))
        msg.channel.id = 123456789012345602
        self.assertFalse(response_matches(msg, svc(), now, 123456789012345600))
        msg.channel.id = svc().channel_id
        msg.created_at = now - timedelta(seconds=1)
        self.assertFalse(response_matches(msg, svc(), now, 123456789012345600))
        msg.edited_at = now + timedelta(seconds=2)
        self.assertFalse(response_matches(msg, svc(), now, 123456789012345600))

    def test_discard_old_edited_message_but_keep_new_edited_message(self):
        now = datetime.now(timezone.utc)
        message = SimpleNamespace(channel=SimpleNamespace(id=svc().channel_id),
              author=SimpleNamespace(id=svc().response_author_id),
              created_at=now - timedelta(minutes=5), edited_at=now + timedelta(seconds=2))
        self.assertFalse(response_matches(message, svc(), now))
        message.created_at = now + timedelta(milliseconds=10)
        self.assertTrue(response_matches(message, svc(), now))
        message.created_at = None
        self.assertFalse(response_matches(message, svc(), now))

    def test_discadia_earned_boost_is_success_even_with_existing_v12_config(self):
        service = svc("discadia-152418")
        service = Service(service.key, "Discadia", service.guild_id, service.channel_id,
                          1222548162741538938, service.command_name, 86400,
                          ("successfully bumped", "bump done"),
                          ("cooldown", "please wait"), {}, 1222548162741538938)
        message = "**The 420 Lobby** bumped. +1 Boost earned. -# 2-day streak · 12 Boosts this month · Next bump <t:1794797311:R>"
        outcome, why, wait, count = evaluate(message, service, now=1794711000)
        self.assertEqual(outcome, "confirmed")
        self.assertIn("earned boost", why)
        self.assertEqual(wait, 86311)
        self.assertIsNone(count)
        # Never treat a generic boosted status or a different service as proof.
        self.assertEqual(evaluate("2-day streak · 12 Boosts this month", service)[0], "response_seen")
        self.assertEqual(evaluate("The 420 Lobby bumped.", service)[0], "response_seen")
        self.assertEqual(evaluate(message, svc("other"))[0], "response_seen")
        self.assertEqual(evaluate(message + " Please wait 2h", service)[0], "cooldown")

    def test_next_bump_deadline_is_not_a_random_timestamp(self):
        now = 1794711000
        self.assertEqual(next_bump_wait("Next bump <t:1794797311:R>", now), 86311)
        self.assertEqual(next_bump_wait("Next bump at <t:1794797311:R>", now), 86311)
        self.assertEqual(next_bump_wait("Next vote in <t:1794797311:R>", now), 86311)
        self.assertIsNone(next_bump_wait("Next bump <t:1794710000:R>", now))
        self.assertIsNone(next_bump_wait("Last bump <t:1794797311:R>", now))
        self.assertIsNone(next_bump_wait("The server started at <t:1794797311:R>", now))

    def test_discordify_count_is_only_confirmed_when_increasing(self):
        text = "> Total bumps by Dank Tester: **10**\n> Total votes by Dank Tester: **0**\n> This server can be bumped again <t:1794691423:R>"
        self.assertEqual(bump_count(text), 10)
        self.assertEqual(evaluate(text, svc(), prior_bumps=None, now=1794680000)[0], "response_seen")
        self.assertEqual(evaluate(text, svc(), prior_bumps=10, now=1794680000)[0], "response_seen")
        result, reason, wait, count = evaluate(text, svc(), prior_bumps=9, now=1794680000)
        self.assertEqual(result, "confirmed")
        self.assertIn("9 to 10", reason)
        self.assertEqual(wait, 11423)
        self.assertEqual(count, 10)
        self.assertEqual(evaluate(text.replace("**10**", "**8**"), svc(), prior_bumps=10)[0], "response_seen")

    def test_explicit_success_and_cooldown_have_correct_precedence(self):
        self.assertEqual(evaluate("Bump done!", svc())[0], "confirmed")
        result = evaluate("Bump done! Please wait 1h 23m", svc())
        self.assertEqual(result[0], "cooldown")
        self.assertEqual(result[2], 4980)
        self.assertEqual(evaluate("", svc())[0], "no_confirmation")
        self.assertEqual(evaluate("Your next bump is scheduled", svc())[0], "response_seen")

    def test_absolute_time_requires_bump_phrase_and_future(self):
        now = 1794680000
        self.assertEqual(next_bump_wait("This server can be bumped again <t:1794691423:R>", now), 11423)
        self.assertIsNone(next_bump_wait("Stats at <t:1794691423:R>", now))
        self.assertIsNone(next_bump_wait("can bump again <t:1794670000:R>", now))

    def test_counter_persists_across_restart_and_unknown_remains_full_cooldown(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "state.db"
            s = svc()
            db = Store(p)
            db.init_services([s], now=100)
            db.update(s, "response_seen", "counter baseline only", now=200, observed_bumps=11)
            self.assertEqual(db.observed_bumps(s), 11)
            self.assertIsNone(db.states()[0][4])
            self.assertGreaterEqual(db.states()[0][2], 7400)
            db.close()
            db = Store(p)
            self.assertEqual(db.observed_bumps(s), 11)
            db.update(s, "confirmed", "count rose", now=8000, observed_bumps=12, retry_after=10000)
            self.assertEqual(db.observed_bumps(s), 12)
            self.assertEqual(db.states()[0][4], 8000)
            self.assertGreaterEqual(db.states()[0][2], 18000)
            db.update(s, "response_seen", "not increasing", now=20000, observed_bumps=10)
            self.assertEqual(db.observed_bumps(s), 12)
            db.close()

    def test_legacy_unverified_is_migrated_without_shortening_wait(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "legacy.db"
            with sqlite3.connect(p) as c:
                c.execute('''CREATE TABLE schedule (service_id TEXT PRIMARY KEY,status TEXT NOT NULL,
                    due_at REAL NOT NULL,last_attempt_at REAL,last_confirmed_at REAL,
                    consecutive_errors INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',
                    extra_delay_seconds INTEGER NOT NULL DEFAULT 0)''')
                c.execute("INSERT INTO schedule VALUES('discordify','unverified',9999,500,NULL,0,'original',120)")
            db = Store(p)
            try:
                db.init_services([svc()], now=1000)
                self.assertEqual(db.states()[0][1], "no_confirmation")
                self.assertEqual(db.states()[0][2], 9999)
            finally:
                db.close()


if __name__ == "__main__":
    unittest.main()
