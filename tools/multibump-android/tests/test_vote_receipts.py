"""Offline tests: exact-source provider vote notifications, never generated votes."""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock

from engine import Service, Store
from vote_receipts import (
    configured_webhooks, observe, VoteNoticeLedger, recent_count,
    recover_history,
)

NOW = 1794740000.0
GUILD = "1514374173517152418"
CHANNEL = "1514374173517152419"
WEBHOOK = "1531117218291646606"
BOT = "678211574183362571"
PHRASE = "The 420 Lobby received a new vote"


def raw_config():
    return {
        "services": [{"id": "d-invites", "guild_id": GUILD,
                      "application_id": BOT, "enabled": True}],
        "vote_notifications": [{
            "provider": "d-invites", "guild_id": GUILD, "channel_id": CHANNEL,
            "webhook_id": WEBHOOK, "vote_phrase": PHRASE,
        }],
    }


def svc():
    return Service("d-invites", "D-INVITES", int(GUILD), int(CHANNEL), int(BOT),
                   "bump", 7200, ("bump done",), ("cooldown",), {},
                   int(BOT))


def msg(*, webhook=WEBHOOK, guild=GUILD, channel=CHANNEL, content=PHRASE,
        age=30, mid=9999):
    return NS(webhook_id=int(webhook) if webhook else None, id=mid,
              author=NS(id=123456789012345678),
              channel=NS(id=int(channel), guild=NS(id=int(guild))),
              guild=NS(id=int(guild)), content=content, embeds=[],
              created_at=datetime.fromtimestamp(NOW-age, timezone.utc))


class VoteReceiptTests(unittest.TestCase):
    def test_config_requires_enabled_service_and_valid_exact_source(self):
        rules = configured_webhooks(raw_config())
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0].webhook_id, WEBHOOK)
        self.assertEqual(configured_webhooks({"services": []}), ())
        invalid = raw_config()
        invalid["services"][0]["enabled"] = False
        with self.assertRaises(ValueError):
            configured_webhooks(invalid)
        for key, value in [("provider", "discordify"), ("webhook_id", "bad"),
                           ("vote_phrase", "hello")]:
            invalid = raw_config()
            invalid["vote_notifications"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                configured_webhooks(invalid)

    def test_observe_exact_channel_guild_webhook_and_message(self):
        rules = configured_webhooks(raw_config())
        receipt = observe(msg(), rules, now=NOW)
        self.assertEqual(receipt.provider, "d-invites")
        self.assertEqual(receipt.message_id, "9999")
        for overrides in (
            {"webhook": "1531117218291646607"},
            {"webhook": None},
            {"guild": "1514374173517152417"},
            {"channel": "1514374173517152417"},
            {"content": "Vote reminder: The 420 Lobby"},
            {"age": 86401},
            {"age": -90},
        ):
            with self.subTest(**overrides):
                self.assertIsNone(observe(msg(**overrides), rules, now=NOW))

    def test_observation_deduplicates_survives_restart_and_does_not_touch_bumps(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "state.sqlite3"
            store = Store(path, rng=Mock(randint=Mock(side_effect=lambda a, b: a)))
            service = svc()
            store.init_services([service], now=100)
            before_states = store.states()
            before_due = store.next_attempt_at(service)
            before_queue = store.db.execute(
                "SELECT next_send_at FROM dispatch_clock").fetchone()
            ledger = VoteNoticeLedger(store.db)
            proof = observe(msg(), configured_webhooks(raw_config()), now=NOW)
            self.assertTrue(ledger.record(proof, now=NOW))
            self.assertFalse(ledger.record(proof, now=NOW))
            self.assertEqual(store.states(), before_states)
            self.assertEqual(store.next_attempt_at(service), before_due)
            self.assertEqual(store.db.execute(
                "SELECT next_send_at FROM dispatch_clock").fetchone(), before_queue)
            self.assertIsNone(store.db.execute(
                "SELECT 1 FROM sqlite_master WHERE name='vote_state'").fetchone())
            store.close()
            self.assertEqual(recent_count(path, now=NOW), {"d-invites": 1})
            store = Store(path)
            try:
                ledger = VoteNoticeLedger(store.db)
                self.assertFalse(ledger.record(proof, now=NOW))
            finally:
                store.close()

    def test_status_read_only_without_database(self):
        with TemporaryDirectory() as td:
            path = Path(td) / "state.sqlite3"
            self.assertEqual(recent_count(path, now=NOW), {})
            self.assertFalse(path.exists())
            store = Store(path)
            store.close()
            self.assertEqual(recent_count(path, now=NOW), {})

    def test_private_webhook_url_parser_extracts_id_never_token(self):
        from vote_tracker import parse_discord_webhook_id
        url = "https://discord.com/api/webhooks/" + WEBHOOK + "/SECRET." + "x" * 30
        self.assertEqual(parse_discord_webhook_id(url), WEBHOOK)
        for bad in (
            "http://discord.com/api/webhooks/" + WEBHOOK + "/SECRET." + "x" * 30,
            "https://discord.com.evil.example/api/webhooks/" + WEBHOOK + "/SECRET." + "x" * 30,
            "https://discord.com/api/webhooks/" + WEBHOOK + "/short",
            "https://discord.com/api/webhooks/" + WEBHOOK + "/SECRET." + "x" * 30 + "?token=yes",
            "https://discord.com/api/webhooks/" + WEBHOOK + "/SECRET." + "x" * 30 + "#token",
        ):
            with self.subTest(url=bad), self.assertRaises(ValueError):
                parse_discord_webhook_id(bad)

    def test_android_wizard_never_writes_webhook_token(self):
        from manage import read_catalog, add, save_config, read_config
        from vote_tracker import setup_discordinvites_notifications
        from unittest.mock import patch
        with TemporaryDirectory() as td:
            config = Path(td) / "config.json"
            raw = {"services": []}
            add(raw, read_catalog(), profile="d-invites", guild_id=GUILD,
                channel_id=CHANNEL, non_interactive=True)
            save_config(config, raw)
            token = "SecretTokenForMyWebhook" + "x" * 18
            url = "https://discord.com/api/webhooks/" + WEBHOOK + "/" + token
            with patch("builtins.input", return_value=""), \
                 patch("vote_tracker.getpass.getpass", return_value=url):
                self.assertTrue(setup_discordinvites_notifications(config))
            self.assertNotIn(token, config.read_text())
            stored = read_config(config)
            self.assertEqual(len(configured_webhooks(stored)), 1)
            self.assertEqual(stored["vote_notifications"][0]["webhook_id"], WEBHOOK)
            self.assertEqual(len(stored["services"]), 1)
            self.assertNotIn("token", stored["vote_notifications"][0])

    def test_bot_event_integration_records_webhook_without_dispatching_vote_or_bump(self):
        import time
        from unittest.mock import patch
        from bumper import run_bot
        rules_config = raw_config()
        service = svc()
        class Channel:
            id = int(CHANNEL)
            guild = NS(id=int(GUILD))
            def history(self, *, limit, after):
                async def empty():
                    if False:
                        yield None
                return empty()
        channel = Channel()
        class FakeClient:
            user = NS(id=1531117218291646605)
            closed = False
            def event(self, handler):
                setattr(self, handler.__name__, handler)
                return handler
            def get_channel(self, cid):
                return channel
            def is_closed(self):
                return self.closed
            async def wait_until_ready(self):
                return None
            async def start(self, token):
                await self.on_ready()
                await self.on_message(msg(mid=60606))
                self.closed = True
                await asyncio.sleep(0)
        client = FakeClient()
        with TemporaryDirectory() as td:
            path = Path(td) / "state.sqlite3"
            store = Store(path, rng=Mock(randint=Mock(side_effect=lambda lo, hi: lo)))
            store.init_services([service], now=time.time() + 3600)
            before = store.states()
            with patch.dict("sys.modules", {"discord": NS(Client=lambda: client)}), \
                 patch("vote_receipts.time.time", return_value=NOW):
                asyncio.run(run_bot(rules_config, [service], store,
                                    token_override="OFFLINE_TEST_ONLY"))
            self.assertEqual(store.states(), before)
            self.assertEqual(store.db.execute(
                "SELECT COUNT(*) FROM provider_vote_notices").fetchone()[0], 1)
            self.assertEqual(store.db.execute(
                "SELECT COUNT(*) FROM events WHERE event='attempt'").fetchone()[0], 0)
            store.close()

    def test_tdl_listing_upvoted_webhook_is_an_observed_provider_event(self):
        from tdl_voting import TDL_APP_ID, TDL_KEY
        raw = raw_config()
        raw["vote_services"] = [{
            "provider": TDL_KEY, "application_id": TDL_APP_ID,
            "guild_id": GUILD, "mode": "member_slash_command", "enabled": True,
        }]
        raw["vote_notifications"].append({
            "provider": TDL_KEY, "guild_id": GUILD, "channel_id": CHANNEL,
            "webhook_id": "1531117218291646608", "vote_phrase": "upvot",
        })
        rules = configured_webhooks(raw)
        receipt = observe(msg(webhook="1531117218291646608",
                              content="The 420 Lobby was upvoted by a member"),
                          rules, now=NOW)
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt.provider, TDL_KEY)
        self.assertIsNone(observe(msg(webhook=WEBHOOK, content="upvoted"),
                                  rules, now=NOW))
        self.assertIsNone(observe(msg(webhook="1531117218291646608",
                                      content="Listing bumped!"),
                                  rules, now=NOW))
        with TemporaryDirectory() as td:
            store = Store(Path(td) / "state.sqlite3")
            ledger = VoteNoticeLedger(store.db)
            self.assertTrue(ledger.record(receipt, now=NOW))
            self.assertFalse(ledger.record(receipt, now=NOW))
            store.close()
            self.assertEqual(recent_count(Path(td) / "state.sqlite3", now=NOW),
                             {TDL_KEY: 1})

    def test_tdl_notifications_require_selected_official_vote_only_service(self):
        from tdl_voting import TDL_APP_ID, TDL_KEY
        raw = raw_config()
        raw["vote_notifications"].append({
            "provider": TDL_KEY, "guild_id": GUILD, "channel_id": CHANNEL,
            "webhook_id": "1531117218291646608", "vote_phrase": "upvoted",
        })
        with self.assertRaises(ValueError):
            configured_webhooks(raw)
        raw["vote_services"] = [{
            "provider": TDL_KEY, "application_id": TDL_APP_ID,
            "guild_id": GUILD, "mode": "member_slash_command", "enabled": True,
        }]
        self.assertEqual(len(configured_webhooks(raw)), 2)
        raw["vote_notifications"][-1]["webhook_id"] = WEBHOOK
        with self.assertRaises(ValueError):
            configured_webhooks(raw)

    def test_tdl_android_webhook_setup_never_persists_token(self):
        from tdl_voting import TDL_APP_ID, TDL_KEY
        from vote_tracker import setup_tdl_notifications
        from manage import read_catalog, add, save_config, read_config
        from unittest.mock import patch
        with TemporaryDirectory() as td:
            path = Path(td) / "config.json"
            raw = {"services": []}
            add(raw, read_catalog(), profile="disboard", guild_id=GUILD,
                channel_id=CHANNEL, non_interactive=True)
            raw["vote_services"] = [{
                "provider": TDL_KEY, "guild_id": GUILD,
                "application_id": TDL_APP_ID,
                "mode": "member_slash_command", "enabled": True,
            }]
            save_config(path, raw)
            token = "secret"+("x" * 38)
            url = "https://discord.com/api/webhooks/1531117218291646608/" + token
            with patch("builtins.input", return_value=""), \
                 patch("vote_tracker.getpass.getpass", return_value=url):
                self.assertTrue(setup_tdl_notifications(path))
            saved = read_config(path)
            self.assertEqual(saved["vote_notifications"][0]["provider"], TDL_KEY)
            self.assertEqual(saved["vote_notifications"][0]["vote_phrase"], "upvot")
            self.assertNotIn(token, path.read_text())
            self.assertEqual(len(saved["services"]), 1)

    def test_bounded_backfill_is_idempotent_and_failure_is_reported(self):
        rules = configured_webhooks(raw_config())
        class Channel:
            def history(self, *, limit, after):
                self.limit = limit
                async def pages():
                    yield msg(mid=50)
                    yield msg(mid=51)
                    yield msg(mid=52, webhook="1531117218291646607")
                return pages()
        channel = Channel()
        client = NS(get_channel=lambda _: channel)
        with TemporaryDirectory() as td:
            store = Store(Path(td) / "state.sqlite3")
            ledger = VoteNoticeLedger(store.db)
            async def backfill():
                return await recover_history(client, rules, ledger, clock=lambda: NOW)
            self.assertEqual(asyncio.run(backfill()), {
                "channels_checked": 1, "new_notices": 2,
                "failures": 0, "possibly_truncated": 0,
            })
            self.assertEqual(channel.limit, 200)
            self.assertEqual(asyncio.run(backfill())["new_notices"], 0)
            store.close()
            class BadClient:
                def get_channel(self, _):
                    raise RuntimeError("history unavailable")
            store = Store(Path(td) / "state.sqlite3")
            ledger = VoteNoticeLedger(store.db)
            self.assertEqual(asyncio.run(recover_history(
                BadClient(), rules, ledger, clock=lambda: NOW))["failures"], 1)
            store.close()


if __name__ == "__main__":
    unittest.main()
