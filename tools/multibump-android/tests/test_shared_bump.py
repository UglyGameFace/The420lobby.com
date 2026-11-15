"""Public-confirmation isolation and crash-safe shared cooldown regression tests."""
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock

from engine import Service, Store
from shared_bump import public_evidence, recover_public_history
from status_view import show_status

NOW = 1794740000.0
GUILD = 1514374173517152418
CHANNEL = 1514374173517152419
BOT = 302050872383242240
SELF = 1531117218291646605
OTHER = 1531117218291646606


def svc(bot=BOT, cooldown=7200, key='disboard'):
    return Service(key, key, GUILD, CHANNEL, bot, 'bump', cooldown,
                   ('bump done', 'successfully bumped', 'bump successful'),
                   ('please wait', 'cooldown', 'try again'), {}, bot)


def message(service=None, *, body='DISBOARD: Bump done!', age=50,
            bot=None, guild=GUILD, channel=CHANNEL, invoker=OTHER, mid=98421, embeds=None):
    service = service or svc()
    return NS(id=mid, guild=NS(id=guild), channel=NS(id=channel, guild=NS(id=guild)),
              author=NS(id=service.response_author_id if bot is None else bot),
              created_at=datetime.fromtimestamp(NOW - age, timezone.utc),
              interaction_metadata=NS(user=NS(id=invoker)) if invoker is not None else None,
              content=body, embeds=embeds or [])


class PublicObservationTests(unittest.TestCase):
    def test_real_public_confirmation_and_required_source(self):
        service = svc()
        e = public_evidence(message(service), service, now=NOW, self_id=SELF)
        self.assertEqual(e.event, 'public_bump')
        self.assertGreater(e.hold_until, NOW + 7200 - 50)
        for override in [dict(bot=1111), dict(guild=5555), dict(channel=8888),
                         dict(invoker=SELF), dict(age=7200 + 86401),
                         dict(body='You can bump later'),
                         dict(body='Please wait: bump done!')]:
            self.assertIsNone(public_evidence(message(service, **override), service,
                                              now=NOW, self_id=SELF), override)

    def test_old_edits_and_missing_id_are_ignored(self):
        s = svc()
        m = message(s, age=200000)
        m.edited_at = datetime.fromtimestamp(NOW, timezone.utc)
        self.assertIsNone(public_evidence(m, s, now=NOW, self_id=SELF))
        m = message(s)
        m.id = None
        self.assertIsNone(public_evidence(m, s, now=NOW, self_id=SELF))

    def test_discadia_public_boost_is_confirmed(self):
        s = svc(bot=1222548162741538938, cooldown=86400, key='discadia')
        m = message(s, body='The 420 Lobby bumped. +1 Boost earned. Next bump <t:1794826450:R>')
        e = public_evidence(m, s, now=NOW, self_id=SELF)
        self.assertEqual(e.event, 'public_bump')
        self.assertGreaterEqual(e.hold_until, 1794826450 + 120)
        self.assertIsNone(public_evidence(message(s, body='12 Boosts this month'), s, now=NOW))

    def test_discordify_status_is_wait_not_success(self):
        s = svc(bot=1326784586696626176, key='discordify')
        body = '> Total bumps by Guest: **1**\nThis server can be bumped again <t:1794747000:R>'
        e = public_evidence(message(s, body=body, age=60), s, now=NOW, self_id=SELF)
        self.assertEqual(e.event, 'public_cooldown')
        self.assertEqual(e.hold_until, 1794747120)
        self.assertIsNone(public_evidence(message(s, body='You can bump again <t:1794747000:R>'),
                                          s, now=NOW))
        self.assertIsNone(public_evidence(message(s, body='Total bumps by Guest: **1**'),
                                          s, now=NOW))

    def test_immutable_shared_hold_survives_local_outcome_and_restart(self):
        s = svc()
        with TemporaryDirectory() as td:
            path = Path(td) / 'state.sqlite3'
            db = Store(path, rng=Mock(randint=Mock(side_effect=lambda lo, hi: lo)))
            db.init_services([s], now=100)
            evidence = public_evidence(message(s), s, now=NOW, self_id=SELF)
            self.assertTrue(db.record_public_bump(s, evidence, now=NOW))
            self.assertFalse(db.record_public_bump(s, evidence, now=NOW))
            hold = db.next_attempt_at(s)
            self.assertGreater(hold, NOW)
            self.assertFalse(db.reserve(s, now=NOW))
            self.assertEqual(db.states()[0][3], None)
            db.update(s, 'error', 'presend failure', now=NOW)
            self.assertFalse(db.due(s, now=NOW+300))
            self.assertGreaterEqual(db.next_attempt_at(s), hold)
            db.close()
            db = Store(path)
            self.assertEqual(db.next_attempt_at(s), hold)
            self.assertFalse(db.reserve(s, now=NOW+500))
            db.close()
            lines = []
            show_status(path, now=NOW+100, output=lines.append)
            report = '\n'.join(lines)
            self.assertIn('Observed public bot confirmations 1', report)
            self.assertIn('Last public bump:', report)
            self.assertIn('Public hold:', report)
            self.assertIn('next no earlier than', report)

    def test_pending_local_confirmation_cannot_short_circuit_shared_hold(self):
        s = svc()
        with TemporaryDirectory() as td:
            db = Store(Path(td) / 'state.sqlite3', rng=Mock(randint=Mock(side_effect=lambda a, b: a)))
            db.init_services([s], now=NOW-1000)
            self.assertTrue(db.reserve(s, now=NOW-100))
            evidence = public_evidence(message(s, age=20, mid=111), s, now=NOW, self_id=SELF)
            self.assertTrue(db.record_public_bump(s, evidence, now=NOW))
            hold = db.next_attempt_at(s)
            db.update(s, 'confirmed', 'own attempt', now=NOW+10)
            self.assertGreaterEqual(db.next_attempt_at(s), hold)
            db.close()

    def test_history_recovers_during_restart_once_and_ignores_unrelated(self):
        s = svc()
        captured = [message(s, mid=1), message(s, bot=999, mid=2),
                    message(s, invoker=SELF, mid=3)]
        class Channel:
            def history(self, *, limit, after):
                async def feed():
                    for item in captured:
                        yield item
                return feed()
        client = NS(get_channel=lambda id: Channel())
        with TemporaryDirectory() as td:
            db = Store(Path(td) / 'state.db')
            db.init_services([s], now=100)
            async def run():
                return await recover_public_history(client, [s], db, self_id=SELF,
                                                     clock=lambda: NOW)
            result = asyncio.run(run())
            self.assertEqual(result, {'channels_checked': 1, 'new_observations': 1,
                                      'failures': 0, 'possibly_truncated': 0})
            result = asyncio.run(run())
            self.assertEqual(result['new_observations'], 0)
            self.assertFalse(db.due(s, now=NOW))
            db.close()

    def test_history_failure_is_reported_not_invented(self):
        s = svc()
        class BadClient:
            def get_channel(self, channel_id):
                raise RuntimeError('not visible')
        with TemporaryDirectory() as td:
            db = Store(Path(td) / 'state.db')
            db.init_services([s], now=100)
            result = asyncio.run(recover_public_history(BadClient(), [s], db,
                                                         clock=lambda: NOW))
            self.assertEqual(result['failures'], 1)
            self.assertEqual(result['new_observations'], 0)
            db.close()

if __name__ == '__main__':
    unittest.main()

class StartupIntegrationTests(unittest.TestCase):
    def test_backfilled_other_members_bump_blocks_initial_dispatch(self):
        from unittest.mock import patch
        from bumper import run_bot
        s = svc()
        observed = []
        real_sleep = asyncio.sleep
        class HistoryChannel:
            id = CHANNEL
            guild = NS(id=GUILD)
            def history(self, *, limit, after):
                async def stream():
                    yield message(s, mid=2222, age=20)
                return stream()
        channel = HistoryChannel()
        class FakeClient:
            user = NS(id=SELF)
            closed = False
            def event(self, handler):
                setattr(self, handler.__name__, handler)
                return handler
            def get_channel(self, channel_id):
                return channel
            def is_closed(self):
                return self.closed
            async def wait_until_ready(self):
                return None
            async def start(self, token):
                await self.on_ready()
                for _ in range(30):
                    await real_sleep(0)
                self.closed = True
                await real_sleep(0)
        client = FakeClient()
        with TemporaryDirectory() as td:
            db = Store(Path(td) / 'state.db')
            db.init_services([s], now=100)
            async def should_not_send(*a, **k):
                observed.append('sent')
                raise AssertionError('command dispatched despite recent public bump')
            async def yield_only(*a):
                await real_sleep(0)
            with patch.dict('sys.modules', {'discord': NS(Client=lambda: client)}), \
                 patch('engine.time.time', return_value=NOW), \
                 patch('bumper.CommandIndex.resolve', new=should_not_send), \
                 patch('bumper.asyncio.sleep', new=yield_only):
                asyncio.run(run_bot({'check_interval_seconds':30}, [s], db,
                                    token_override='OFFLINE_TEST_ONLY'))
            self.assertEqual(observed, [])
            self.assertFalse(db.due(s, now=NOW))
            db.close()
