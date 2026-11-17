"""Contract tests for TheDiscordList's official vote-only integration."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
import sqlite3

from manage import read_config, save_config, read_catalog, add
from tdl_voting import (
    TDL_APP_ID, TDL_INVITE, TDL_KEY, TDL_COOLDOWN_SECONDS, TDL_LISTING_CREATE,
    active_guilds, candidate_guilds, configured_vote_services,
    enable_tdl, setup_in_menu,
)
from vote_capabilities import format_capabilities
from engine import load_config

GUILD = "1514374173517152418"
OTHER_GUILD = "1514374173517152419"
CHANNEL = "1531117218291646605"


def raw_setup():
    raw = {"services": []}
    add(raw, read_catalog(), profile="disboard",
        guild_id=GUILD, channel_id=CHANNEL, non_interactive=True)
    return raw


class TDLVoteOnlyTests(TestCase):
    def test_official_documented_capabilities(self):
        self.assertEqual(TDL_APP_ID, "1522501063456985179")
        self.assertEqual(TDL_COOLDOWN_SECONDS, 43200)
        self.assertIn(TDL_APP_ID, TDL_INVITE)
        self.assertEqual(TDL_LISTING_CREATE, "https://thediscordlist.com/listings/create")

    def test_save_once_preserves_existing_bump_service(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            raw = raw_setup()
            save_config(path, raw)
            before_services = read_config(path)["services"]
            self.assertTrue(enable_tdl(path, GUILD))
            self.assertFalse(enable_tdl(path, GUILD))
            saved = read_config(path)
            self.assertEqual(saved["services"], before_services)
            self.assertEqual(len(configured_vote_services(saved)), 1)
            vote = configured_vote_services(saved)[0]
            self.assertEqual(vote["provider"], TDL_KEY)
            self.assertEqual(vote["application_id"], TDL_APP_ID)
            self.assertEqual(vote["mode"], "member_slash_command")
            self.assertEqual(active_guilds(saved), {GUILD})
            self.assertEqual(len(load_config(path)[1]), 1)
            self.assertIn("TheDiscordList [VOTE ONLY /upvote; SETUP SAVED]",
                          "\n".join(format_capabilities(saved)))
            self.assertNotIn("upvote", str(saved["services"]))

    def test_never_register_vote_only_bot_as_bump_command(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            save_config(path, raw_setup())
            enable_tdl(path, GUILD)
            for s in load_config(path)[1]:
                self.assertNotEqual(s.application_id, int(TDL_APP_ID))
            self.assertFalse((Path(td) / "bump_state.sqlite3").exists())

    def test_unknown_guild_rejected_without_mutations(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            save_config(path, raw_setup())
            before = path.read_bytes()
            with self.assertRaises(ValueError):
                enable_tdl(path, OTHER_GUILD)
            self.assertEqual(path.read_bytes(), before)

    def test_one_menu_action_sets_up_known_server(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            save_config(path, raw_setup())
            with patch("builtins.input", side_effect=AssertionError(
                    "single-guild setup must be one action")):
                self.assertTrue(setup_in_menu(path))
            self.assertEqual(active_guilds(read_config(path)), {GUILD})

    def test_multiple_guild_selection_is_explicit(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            raw = raw_setup()
            add(raw, read_catalog(), profile="disboard",
                guild_id=OTHER_GUILD, channel_id=CHANNEL, non_interactive=True)
            save_config(path, raw)
            self.assertEqual(candidate_guilds(raw), [GUILD, OTHER_GUILD])
            with patch("builtins.input", return_value="2"):
                self.assertTrue(setup_in_menu(path))
            self.assertEqual(active_guilds(read_config(path)), {OTHER_GUILD})

    def test_invalid_provider_and_guild_config_rejected(self):
        with self.assertRaises(ValueError):
            configured_vote_services({"vote_services": [{
                "provider": TDL_KEY, "guild_id": GUILD,
                "application_id": "999999999999999999", "mode": "member_slash_command"
            }]})
        with self.assertRaises(ValueError):
            configured_vote_services({"vote_services": [{
                "provider": TDL_KEY, "guild_id": GUILD,
                "application_id": TDL_APP_ID, "mode": "auto_submit"
            }]})
        with self.assertRaises(ValueError):
            configured_vote_services({"vote_services": [{"provider": "unknown"}]})
