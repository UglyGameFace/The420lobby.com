"""Regression tests for explicitly opted-in TDL /upvote through MultiBump.

The test transport never logs into Discord. TDL explicitly prohibits scripted
ranking manipulation; this feature is opt-in and carries account/listing risk.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from command_lookup import CommandIndex
from engine import Store, load_config
from manage import add, read_catalog, read_config, save_config
from response_reader import evaluate
from tdl_voting import (
    TDL_APP_ID, TDL_COOLDOWN_SECONDS, enable_tdl, set_auto_submit,
    configured_auto_vote_services, configured_vote_services,
    change_auto_vote_in_menu,
)

GUILD = "1514374173517152418"
CHANNEL = "1531117218291646605"


def make_config():
    raw = {"services": []}
    add(raw, read_catalog(), profile="disboard",
        guild_id=GUILD, channel_id=CHANNEL, non_interactive=True)
    return raw


class ScheduledVoteTests(unittest.TestCase):
    def test_opt_in_off_by_default_and_idempotent_toggle(self):
        with TemporaryDirectory() as td:
            p = Path(td) / "config.json"
            save_config(p, make_config())
            self.assertTrue(enable_tdl(p, GUILD))
            before = read_config(p)["services"]
            self.assertEqual(configured_auto_vote_services(read_config(p)), [])
            self.assertTrue(set_auto_submit(p, GUILD, True))
            self.assertFalse(set_auto_submit(p, GUILD, True))
            raw = read_config(p)
            self.assertEqual(raw["services"], before)
            self.assertEqual(len(configured_vote_services(raw)), 1)
            auto = configured_auto_vote_services(raw)
            self.assertEqual(len(auto), 1)
            service = auto[0]
            self.assertEqual(service.key, "vote-tdl-" + GUILD)
            self.assertEqual(service.command_name, "upvote")
            self.assertEqual(service.guild_id, int(GUILD))
            self.assertEqual(service.channel_id, int(CHANNEL))
            self.assertEqual(service.application_id, int(TDL_APP_ID))
            self.assertEqual(service.response_author_id, int(TDL_APP_ID))
            self.assertEqual(service.cooldown_seconds, TDL_COOLDOWN_SECONDS)
            self.assertEqual(service.options, {})
            self.assertEqual(len(load_config(p)[1]), 1)
            self.assertTrue(set_auto_submit(p, GUILD, False))
            self.assertEqual(configured_auto_vote_services(read_config(p)), [])
            self.assertFalse(set_auto_submit(p, GUILD, False))

    def test_explicit_confirmation_required_via_menu(self):
        with TemporaryDirectory() as td:
            p = Path(td) / "config.json"
            save_config(p, make_config())
            enable_tdl(p, GUILD)
            with patch("builtins.input", return_value=""):
                change_auto_vote_in_menu(p)
            self.assertFalse(read_config(p)["vote_services"][0].get("auto_submit", False))
            with patch("builtins.input", return_value="ENABLE"):
                change_auto_vote_in_menu(p)
            self.assertTrue(read_config(p)["vote_services"][0]["auto_submit"])
            with patch("builtins.input", return_value="y"):
                change_auto_vote_in_menu(p)
            self.assertFalse(read_config(p)["vote_services"][0]["auto_submit"])

    def test_config_rejects_unconfigured_or_cross_guild_channels(self):
        with TemporaryDirectory() as td:
            p = Path(td) / "config.json"
            save_config(p, make_config())
            with self.assertRaises(ValueError):
                set_auto_submit(p, GUILD, True)
            enable_tdl(p, GUILD)
            raw = read_config(p)
            raw["vote_services"][0]["channel_id"] = "1531117218291646699"
            raw["vote_services"][0]["auto_submit"] = True
            with self.assertRaises(ValueError):
                configured_auto_vote_services(raw)
            raw["vote_services"][0]["channel_id"] = CHANNEL
            raw["services"][0]["enabled"] = False
            with self.assertRaises(ValueError):
                configured_auto_vote_services(raw)
            raw["services"][0]["enabled"] = True
            raw["vote_services"][0]["auto_submit"] = "yes"
            with self.assertRaises(ValueError):
                configured_vote_services(raw)

    def test_own_durable_clock_preserved_across_restart_and_separate_from_bump(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            state = Path(td) / "bump_state.sqlite3"
            save_config(config, make_config())
            enable_tdl(config, GUILD)
            set_auto_submit(config, GUILD, True)
            raw, bumps = load_config(config)
            votes = configured_auto_vote_services(raw)
            services = bumps + votes
            store = Store(state)
            try:
                store.init_services(services, now=1000)
                self.assertEqual(len(store.states()), 2)
                self.assertTrue(store.reserve(votes[0], now=1500))
                store.update(votes[0], "no_confirmation", "Ephemeral response", now=1500)
                next_vote = store.next_attempt_at(votes[0])
                self.assertGreaterEqual(next_vote, 1500 + 43200 + 120)
                # The normal DISBOARD clock should remain independently ready.
                self.assertLess(store.db.execute(
                    "SELECT due_at FROM schedule WHERE service_id=?", (bumps[0].key,)
                ).fetchone()[0], next_vote)
            finally:
                store.close()
            store = Store(state)
            try:
                self.assertEqual(store.next_attempt_at(votes[0]), next_vote)
                self.assertFalse(store.due(votes[0], now=1500 + 43200))
                self.assertIsNone(store.db.execute(
                    "SELECT last_confirmed_at FROM schedule WHERE service_id=?",
                    (votes[0].key,)
                ).fetchone()[0])
            finally:
                store.close()

    def test_vote_responses_only_confirm_explicit_success(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            save_config(config, make_config())
            enable_tdl(config, GUILD)
            set_auto_submit(config, GUILD, True)
            service = configured_auto_vote_services(read_config(config))[0]
            positive = ("You have upvoted The 420 Lobby! Total: 12. "
                        "Next vote in 12 hours.")
            self.assertEqual(evaluate(positive, service)[0], "confirmed")
            self.assertEqual(evaluate("Your vote has been counted.", service)[0], "confirmed")
            self.assertEqual(evaluate("You already voted! Try again in 8 hours", service)[0], "cooldown")
            self.assertEqual(evaluate("The server's listing has 14 upvotes.", service)[0], "response_seen")
            self.assertEqual(evaluate("Thanks for checking the leaderboard.", service)[0], "response_seen")
            self.assertEqual(evaluate("", service)[0], "no_confirmation")

    def test_real_command_index_resolves_only_official_tdl_app(self):
        async def task():
            fake = SimpleNamespace(name="upvote", application_id=int(TDL_APP_ID))
            channel = SimpleNamespace(id=int(CHANNEL),
                                      application_commands=lambda: None)
            async def get_commands():
                return [SimpleNamespace(name="upvote", application_id=111),
                        fake]
            channel.application_commands = get_commands
            with TemporaryDirectory() as td:
                config = Path(td) / "config.json"
                save_config(config, make_config())
                enable_tdl(config, GUILD)
                set_auto_submit(config, GUILD, True)
                service = configured_auto_vote_services(read_config(config))[0]
                # The actual Discord library represents slash commands as callable objects.
                async def actual_upvote(*args, **kwargs):
                    return None
                actual_upvote.name = "upvote"
                actual_upvote.application_id = int(TDL_APP_ID)
                async def indexed():
                    return [SimpleNamespace(name="upvote", application_id=111), actual_upvote]
                channel.application_commands = indexed
                resolved = await CommandIndex().resolve(channel, service)
                self.assertIs(resolved, actual_upvote)
        import asyncio
        asyncio.run(task())


if __name__ == "__main__":
    unittest.main()
