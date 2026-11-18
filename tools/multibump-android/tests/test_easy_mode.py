"""Phone-first upgrade and configuration flow contract tests."""
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from home import add_requested_services, parse_channel_link, parse_selection, quick_add, show_status
from manage import read_catalog, read_config

ROOT = Path(__file__).resolve().parents[1]
GUILD = "123456789012345678"
CHANNEL = "123456789012345679"
MESSAGE = "123456789012345670"


class EasyModeTests(unittest.TestCase):
    def test_discord_message_link_is_one_input_for_guild_and_channel(self):
        self.assertEqual(parse_channel_link(f"https://discord.com/channels/{GUILD}/{CHANNEL}/{MESSAGE}"), (GUILD, CHANNEL))
        self.assertEqual(parse_channel_link(f"https://discord.com/channels/{GUILD}/{CHANNEL}"), (GUILD, CHANNEL))
        self.assertEqual(parse_channel_link(f"https://discordapp.com/channels/{GUILD}/{CHANNEL}"), (GUILD, CHANNEL))
        self.assertEqual(parse_channel_link(f"<https://discord.com/channels/{GUILD}/{CHANNEL}/{MESSAGE}>"), (GUILD, CHANNEL))
        for invalid in (
            f"https://discord.com.evil.example/channels/{GUILD}/{CHANNEL}",
            f"https://discord.com/channels/@me/{CHANNEL}",
            "javascript:alert(1)",
            f"https://discord.com/channels/{GUILD}/not-an-id",
            f"http://discord.com/channels/{GUILD}/{CHANNEL}",
        ):
            self.assertIsNone(parse_channel_link(invalid), invalid)

    def test_multi_select_deduplicates_and_rejects_invalid(self):
        self.assertEqual(parse_selection("1, 2,2 4", 5), [0, 1, 3])
        for raw in ("", "all", "0", "99", "2,3x"):
            with self.assertRaises(ValueError):
                parse_selection(raw, 5)

    def test_batch_add_configures_two_presets_without_app_ids(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            answers = iter(["1,2", f"https://discord.com/channels/{GUILD}/{CHANNEL}/{MESSAGE}"])
            with patch("builtins.input", side_effect=lambda *_: next(answers)):
                count = quick_add(config, read_catalog())
            self.assertEqual(count, 2)
            raw = read_config(config)
            self.assertEqual({s["label"] for s in raw["services"]}, {"DISBOARD", "OneBump"})
            self.assertTrue(all(s["channel_id"] == CHANNEL for s in raw["services"]))
            self.assertTrue(all(s["guild_id"] == GUILD for s in raw["services"]))

    def test_repeated_batch_skips_existing_presets_and_preserves_config(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            answers = iter(["1", f"https://discord.com/channels/{GUILD}/{CHANNEL}"])
            with patch("builtins.input", side_effect=lambda *_: next(answers)):
                self.assertEqual(quick_add(config, read_catalog()), 1)
            before = config.read_bytes()
            answers = iter(["1", ""])
            with patch("builtins.input", side_effect=lambda *_: next(answers)):
                self.assertEqual(quick_add(config, read_catalog()), 0)
            self.assertEqual(config.read_bytes(), before)

    def test_unverified_cooldown_requires_single_prompt(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            answers = iter(["3", f"https://discord.com/channels/{GUILD}/{CHANNEL}", "120"])
            with patch("builtins.input", side_effect=lambda *_: next(answers)):
                self.assertEqual(quick_add(config, read_catalog()), 1)
            self.assertEqual(read_config(config)["services"][0]["cooldown_seconds"], 7200)

    def test_six_service_presets_have_verified_bot_ids_and_commands(self):
        catalog = read_catalog()
        self.assertEqual(len(catalog), 6)
        self.assertEqual(catalog["discordify"]["application_id"], "1326784586696626176")
        self.assertEqual(catalog["d-invites"]["application_id"], "678211574183362571")
        self.assertEqual(catalog["discordify"]["cooldown_seconds"], 7200)
        self.assertEqual(catalog["discordify"]["command_name"], "bump")
        self.assertEqual(catalog["d-invites"]["command_name"], "bump")

    def test_new_service_confirmations_distinguish_bumps_from_cooldowns(self):
        from engine import classify, load_config
        from manage import add, save_config
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            raw = {"services": []}
            catalog = read_catalog()
            for key in ("discordify", "d-invites"):
                add(raw, catalog, profile=key, guild_id=GUILD, channel_id=CHANNEL, non_interactive=True)
            save_config(config, raw)
            _, services = load_config(config)
            for service in services:
                self.assertEqual(classify("Your server has been bumped! Next bump in 2 hours", service), "confirmed")
                self.assertEqual(classify("Already bumped. Please wait another 45 minutes.", service), "cooldown")

    def test_add_missing_presets_reuses_existing_location_without_prompts(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            answers = iter(["1,2,4", f"https://discord.com/channels/{GUILD}/{CHANNEL}"])
            with patch("builtins.input", side_effect=lambda *_: next(answers)):
                self.assertEqual(quick_add(config, read_catalog()), 3)
            existing = read_config(config)
            original_ids = [s["id"] for s in existing["services"]]
            with patch("builtins.input", side_effect=AssertionError("Must not prompt for an existing single server")):
                self.assertEqual(add_requested_services(config, read_catalog()), 2)
            actual = read_config(config)["services"]
            self.assertEqual([s["id"] for s in actual[:3]], original_ids)
            self.assertEqual({s["label"] for s in actual[-2:]}, {"Discordify", "D-INVITES"})
            self.assertTrue(all(s["guild_id"] == GUILD and s["channel_id"] == CHANNEL for s in actual))
            self.assertEqual({s["application_id"] for s in actual[-2:]}, {"1326784586696626176", "678211574183362571"})
            before = config.read_bytes()
            with patch("builtins.input", side_effect=AssertionError("Must not prompt when already added")):
                self.assertEqual(add_requested_services(config, read_catalog()), 0)
            self.assertEqual(config.read_bytes(), before)

    def test_add_missing_presets_does_not_make_up_location_or_create_config(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            with patch("builtins.input", side_effect=AssertionError("Must not prompt for unknown location")):
                self.assertEqual(add_requested_services(config, read_catalog()), 0)
            self.assertFalse(config.exists())

    def test_multi_server_add_requires_explicit_location_choice(self):
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            raw = {"services": []}
            from manage import add, save_config
            catalog = read_catalog()
            other_guild = "123456789012345688"
            add(raw, catalog, profile="disboard", guild_id=GUILD, channel_id=CHANNEL, non_interactive=True)
            add(raw, catalog, profile="onebump", guild_id=other_guild, channel_id=CHANNEL, non_interactive=True)
            save_config(config, raw)
            with patch("home.ask_location", return_value=(GUILD, CHANNEL)) as ask:
                self.assertEqual(add_requested_services(config, catalog), 2)
            ask.assert_called_once()
            actual = read_config(config)["services"]
            self.assertEqual(len(actual), 4)
            self.assertEqual({s["guild_id"] for s in actual[-2:]}, {GUILD})

    def test_status_empty_database_is_not_created(self):
        with TemporaryDirectory() as td:
            root = Path(td)
            with patch("builtins.print") as capture:
                show_status(root / "config.json", root / "state.db")
            self.assertFalse((root / "state.db").exists())
            self.assertIn("Run history: none yet", [c.args[0] for c in capture.call_args_list])

    def test_easy_upgrade_preserves_data_and_skips_heavy_debian_reinstall(self):
        with TemporaryDirectory() as td:
            root = Path(td)
            home, bin_dir, source = root / 'home', root / 'bin', root / 'downloads'
            home.mkdir(); bin_dir.mkdir(); source.mkdir()
            project = home / 'multibump-selfbot'
            project.mkdir()
            venv = project / '.venv-debian' / 'bin'
            venv.mkdir(parents=True)
            (project / '.venv-debian' / 'pyvenv.cfg').write_text('home = /usr/bin')
            (project / 'config.json').write_text('KEEP-CONFIG')
            (project / 'bump_state.sqlite3').write_bytes(b'KEEP-STATE')
            for filename in ('easy-install.sh', 'multibump.sh', 'home.py', 'credentials.py', 'status_view.py', 'vote_tracker.py', 'vote_capabilities.py', 'vote_receipts.py', 'tdl_voting.py', 'vote_tracker.sh'):
                (source / filename).write_bytes((ROOT / filename).read_bytes())
            # Test launcher rather than running the actual multi-page UI.
            (bin_dir / 'python').write_text('#!/bin/bash\nprintf "launched easy UI\\n"\n')
            (bin_dir / 'python').chmod(0o755)
            (bin_dir / 'proot-distro').write_text('#!/bin/bash\nexit 0\n')
            (bin_dir / 'proot-distro').chmod(0o755)
            env = os.environ.copy()
            env.update({"HOME": str(home), "PREFIX": "/data/data/com.termux/files/usr",
                        "MULTIBUMP_BIN_DIR": str(bin_dir), "PATH": f"{bin_dir}:{env['PATH']}"})
            result = subprocess.run(['bash', str(source / 'easy-install.sh')], capture_output=True,
                                    text=True, env=env, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('launched easy UI', result.stdout)
            self.assertEqual((project / 'config.json').read_text(), 'KEEP-CONFIG')
            self.assertEqual((project / 'bump_state.sqlite3').read_bytes(), b'KEEP-STATE')
            self.assertTrue((bin_dir / 'multibump').is_symlink())
            self.assertEqual((project / 'home.py').read_bytes(), (ROOT / 'home.py').read_bytes())
            self.assertEqual((project / 'credentials.py').read_bytes(), (ROOT / 'credentials.py').read_bytes())
            self.assertEqual((project / 'status_view.py').read_bytes(), (ROOT / 'status_view.py').read_bytes())
            self.assertEqual((project / 'vote_tracker.py').read_bytes(), (ROOT / 'vote_tracker.py').read_bytes())
            self.assertEqual((project / 'vote_capabilities.py').read_bytes(), (ROOT / 'vote_capabilities.py').read_bytes())
            self.assertEqual((project / 'vote_receipts.py').read_bytes(), (ROOT / 'vote_receipts.py').read_bytes())
            self.assertEqual((project / 'tdl_voting.py').read_bytes(), (ROOT / 'tdl_voting.py').read_bytes())
            self.assertTrue((bin_dir / 'multibump-votes').is_symlink())


if __name__ == '__main__':
    unittest.main()
