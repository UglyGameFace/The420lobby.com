"""Offline contract: all configured bots are reported with correct vote semantics."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest

from manage import read_catalog, add, save_config, read_config
from vote_capabilities import PROVIDER_INFO, discover, format_capabilities
from vote_tracker import menu

GUILD = "1514374173517152418"
CHANNEL = "1514374173517152419"


def six_service_config():
    raw = {"services": []}
    catalog = read_catalog()
    for key in catalog:
        kw = {"profile": key, "guild_id": GUILD, "channel_id": CHANNEL,
              "non_interactive": True}
        if catalog[key].get("cooldown_seconds") is None:
            kw["cooldown_minutes"] = 120
        add(raw, catalog, **kw)
    return raw


class VoteCapabilityTests(unittest.TestCase):
    def test_exact_six_app_id_categories_not_mutable_names(self):
        raw = six_service_config()
        self.assertEqual(len(raw["services"]), 6)
        capabilities = discover(raw)
        self.assertEqual(len(capabilities), 6)
        modes = {c.application_id: c.mode for c in capabilities}
        self.assertEqual(modes, {
            "302050872383242240": "no_server_vote",
            "1028956609382199346": "bot_vote_not_server",
            "1159147139960676422": "unverified",
            "1222548162741538938": "manual_server_vote",
            "1326784586696626176": "manual_server_vote",
            "678211574183362571": "automation_prohibited",
        })
        self.assertTrue(all(not c.supports_auto_submit for c in capabilities))
        self.assertEqual(len(PROVIDER_INFO), 6)
        raw["services"][0]["label"] = "Renamed"
        self.assertEqual(discover(raw)[0].mode, "no_server_vote")

    def test_disabled_and_custom_entries_are_not_ignored(self):
        raw = six_service_config()
        raw["services"][0]["enabled"] = False
        raw["services"].append({
            "id": "custom", "label": "MyDirectory", "application_id": "999999999999999999",
            "guild_id": GUILD,
        })
        caps = discover(raw)
        self.assertFalse(caps[0].enabled)
        self.assertEqual(caps[-1].mode, "unverified")
        display = "\n".join(format_capabilities(raw))
        self.assertIn("DISABLED", display)
        self.assertIn("MyDirectory [SERVER VOTE UNVERIFIED]", display)

    def test_show_all_six_without_manual_vote_target_setup(self):
        raw = six_service_config()
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            db = Path(td) / "bump_state.sqlite3"
            save_config(config, raw)
            before = config.read_bytes()
            with patch("builtins.input", return_value="0"), \
                 patch("builtins.print") as capture, \
                 patch("vote_tracker.open_link", side_effect=AssertionError("No web browser allowed")):
                menu(config, db)
            output = "\n".join(" ".join(map(str, call.args)) for call in capture.call_args_list)
            for entry in raw["services"]:
                self.assertIn(entry["label"], output)
            self.assertIn("Automatic server-vote submissions: 0 supported", output)
            self.assertIn("AUTOMATED VOTES PROHIBITED", output)
            self.assertIn("VOTES FOR BOT, NOT YOUR SERVER", output)
            self.assertEqual(config.read_bytes(), before)
            self.assertFalse(db.exists())

    def test_enter_immediately_returns_without_opening_browser(self):
        raw = six_service_config()
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            save_config(config, raw)
            with patch("builtins.input", return_value=""), \
                 patch("vote_tracker.open_link", side_effect=AssertionError("Unexpected browser")):
                menu(config, Path(td) / "bump_state.sqlite3")
            self.assertNotIn("vote_targets", read_config(config))

    def test_empty_config_is_explained_not_autovoted(self):
        self.assertIn("No configured bump services yet.", format_capabilities({"services": []}))
        self.assertEqual(discover({}), [])


if __name__ == "__main__":
    unittest.main()
